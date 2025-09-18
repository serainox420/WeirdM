const filePicker = document.getElementById('filepicker');
const startBtn = document.querySelector('.button.start');
const timelineBody = document.getElementById('timeline-rows');

let uploadLimitInfo = null;

const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const decimals = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[unitIndex]}`;
};

const describeLimitSources = (sources) => {
    if (!Array.isArray(sources) || !sources.length) return 'the PHP upload limit';
    if (sources.length === 1) return sources[0];
    if (sources.length === 2) return `${sources[0]} and ${sources[1]}`;
    return `${sources.slice(0, -1).join(', ')}, and ${sources[sources.length - 1]}`;
};

const readLimitNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const fetchUploadLimit = () => {
    fetch('limits.php', { cache: 'no-store' })
        .then((response) => {
            if (!response.ok) {
                throw new Error('Failed to load upload limits');
            }
            return response.json();
        })
        .then((data) => {
            if (!data || typeof data !== 'object') return;
            const effective = readLimitNumber(data.effectiveBytes);
            const uploadMax = readLimitNumber(data.uploadMaxBytes);
            const postMax = readLimitNumber(data.postMaxBytes);
            let sources = Array.isArray(data.effectiveSources)
                ? data.effectiveSources.filter((name) => typeof name === 'string' && name.trim().length)
                : [];

            if (effective > 0) {
                if (!sources.length) {
                    if (uploadMax > 0 && uploadMax === effective) sources.push('upload_max_filesize');
                    if (postMax > 0 && postMax === effective) sources.push('post_max_size');
                }
                uploadLimitInfo = { bytes: effective, sources };
                return;
            }

            if (uploadMax > 0 || postMax > 0) {
                const fallbackSources = [];
                let fallbackBytes = 0;
                if (uploadMax > 0) {
                    fallbackSources.push('upload_max_filesize');
                    fallbackBytes = fallbackBytes > 0 ? Math.min(fallbackBytes, uploadMax) : uploadMax;
                }
                if (postMax > 0) {
                    fallbackSources.push('post_max_size');
                    fallbackBytes = fallbackBytes > 0 ? Math.min(fallbackBytes, postMax) : postMax;
                }
                uploadLimitInfo = { bytes: fallbackBytes, sources: fallbackSources };
            }
        })
        .catch(() => {
            uploadLimitInfo = uploadLimitInfo || null;
        });
};

if (typeof fetch === 'function') {
    fetchUploadLimit();
}

const setProgress = (label, progress = null) => {
    startBtn.textContent = label;
    if (progress === null || Number.isNaN(progress)) {
        startBtn.style.background = '';
        return;
    }
    const pct = Math.min(100, Math.max(0, Math.round(progress)));
    startBtn.style.background = `linear-gradient(90deg, rgba(0, 175, 244, 0.85) ${pct}%, rgba(45, 125, 70, 0.45) ${pct}%)`;
};

const clampNumber = (value, min, max, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

const sanitizeRange = (minValue, maxValue, fallbackMin, fallbackMax) => {
    let min = clampNumber(minValue, 1, 400, fallbackMin);
    let max = clampNumber(maxValue, 1, 400, fallbackMax);
    if (min > max) {
        [min, max] = [max, min];
    }
    return { min, max };
};

const modes = ['bounce', 'random', 'timeline', 'trim'];

const updateModeVisibility = () => {
    modes.forEach((mode) => {
        const container = document.getElementById(`${mode}-options`);
        const radio = document.getElementById(mode);
        if (!container || !radio) return;
        container.hidden = !radio.checked;
    });
};

document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener('change', () => {
        updateModeVisibility();
    });
});

const updateBounceFieldState = () => {
    ['h', 'v'].forEach((axis) => {
        const style = document.getElementById(`bounce-${axis}-style`).value;
        const staticInput = document.getElementById(`bounce-${axis}-static`);
        const minInput = document.getElementById(`bounce-${axis}-min`);
        const maxInput = document.getElementById(`bounce-${axis}-max`);
        const isStatic = style === 'none';
        staticInput.disabled = !isStatic;
        minInput.disabled = isStatic;
        maxInput.disabled = isStatic;
    });
};

document.querySelectorAll('#bounce-h-style, #bounce-v-style').forEach((select) => {
    select.addEventListener('change', updateBounceFieldState);
});

const updateRandomFieldState = () => {
    ['h', 'v'].forEach((axis) => {
        const enabled = document.getElementById(`random-${axis}`).checked;
        document.getElementById(`random-${axis}-min`).disabled = !enabled;
        document.getElementById(`random-${axis}-max`).disabled = !enabled;
    });
};

document.querySelectorAll('#random-h, #random-v').forEach((checkbox) => {
    checkbox.addEventListener('change', updateRandomFieldState);
});

const createTimelineRow = ({ time, width, height, easing, lockTime = false, lockRemove = false, disableEasing = false }) => {
    const row = document.createElement('tr');
    if (lockRemove) {
        row.classList.add('timeline-row-locked');
    }
    const timeCell = document.createElement('td');
    const timeInput = document.createElement('input');
    timeInput.type = 'number';
    timeInput.className = 'timeline-time';
    timeInput.min = '0';
    timeInput.max = '100';
    timeInput.value = time;
    if (lockTime) {
        timeInput.disabled = true;
    }
    timeCell.appendChild(timeInput);

    const widthCell = document.createElement('td');
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.className = 'timeline-width';
    widthInput.min = '1';
    widthInput.max = '400';
    widthInput.value = width;
    widthCell.appendChild(widthInput);

    const heightCell = document.createElement('td');
    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.className = 'timeline-height';
    heightInput.min = '1';
    heightInput.max = '400';
    heightInput.value = height;
    heightCell.appendChild(heightInput);

    const easingCell = document.createElement('td');
    const easingSelect = document.createElement('select');
    easingSelect.className = 'timeline-ease';
    ['linear', 'easeIn', 'easeOut', 'easeInOut'].forEach((key) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = {
            linear: 'Linear',
            easeIn: 'Ease in',
            easeOut: 'Ease out',
            easeInOut: 'Ease in/out',
        }[key];
        if (key === easing) option.selected = true;
        easingSelect.appendChild(option);
    });
    if (disableEasing) easingSelect.disabled = true;
    easingCell.appendChild(easingSelect);

    const actionsCell = document.createElement('td');
    if (!lockRemove) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'button subtle remove-keyframe';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', () => {
            timelineBody.removeChild(row);
        });
        actionsCell.appendChild(removeButton);
    }

    row.appendChild(timeCell);
    row.appendChild(widthCell);
    row.appendChild(heightCell);
    row.appendChild(easingCell);
    row.appendChild(actionsCell);
    return row;
};

const initializeTimeline = () => {
    timelineBody.innerHTML = '';
    timelineBody.appendChild(
        createTimelineRow({ time: 0, width: 100, height: 100, easing: 'linear', lockTime: true, lockRemove: true, disableEasing: true })
    );
    timelineBody.appendChild(
        createTimelineRow({ time: 100, width: 100, height: 100, easing: 'linear', lockTime: true, lockRemove: true })
    );
};

const addTimelineRow = () => {
    const rows = timelineBody.querySelectorAll('tr');
    const lastRow = rows[rows.length - 1];
    const beforeLastRow = rows[rows.length - 2];
    let defaultTime = 50;
    if (beforeLastRow && lastRow) {
        const prev = Number(beforeLastRow.querySelector('.timeline-time').value);
        const next = Number(lastRow.querySelector('.timeline-time').value);
        defaultTime = Math.round(prev + (next - prev) / 2);
        if (!Number.isFinite(defaultTime)) defaultTime = 50;
        if (defaultTime <= prev) defaultTime = Math.min(next - 1, prev + 1);
        if (defaultTime >= next) defaultTime = Math.max(prev + 1, next - 1);
        defaultTime = clampNumber(defaultTime, prev + 1, next - 1, 50);
    }
    const row = createTimelineRow({ time: defaultTime, width: 120, height: 120, easing: 'linear' });
    timelineBody.insertBefore(row, lastRow || null);
};

document.getElementById('add-keyframe').addEventListener('click', addTimelineRow);
document.getElementById('reset-keyframes').addEventListener('click', initializeTimeline);

const getTimelineRows = () => {
    const rows = [];
    timelineBody.querySelectorAll('tr').forEach((row) => {
        const time = clampNumber(row.querySelector('.timeline-time').value, 0, 100, 0);
        const width = clampNumber(row.querySelector('.timeline-width').value, 1, 400, 100);
        const height = clampNumber(row.querySelector('.timeline-height').value, 1, 400, 100);
        const easing = row.querySelector('.timeline-ease')?.value || 'linear';
        rows.push({ time, width, height, easing });
    });
    rows.sort((a, b) => a.time - b.time);
    const deduped = [];
    rows.forEach((entry) => {
        if (!deduped.length || entry.time !== deduped[deduped.length - 1].time) {
            deduped.push(entry);
        } else {
            deduped[deduped.length - 1] = entry;
        }
    });
    return deduped;
};

const validateTimelineKeyframes = (keyframes) => {
    if (keyframes.length < 2) {
        return { ok: false, message: 'Add at least two keyframes (0% and 100%).' };
    }
    const first = keyframes[0];
    const last = keyframes[keyframes.length - 1];
    if (first.time !== 0 || last.time !== 100) {
        return { ok: false, message: 'Ensure the first keyframe is at 0% and the last at 100%.' };
    }
    return { ok: true };
};

const readBounceSettings = () => {
    const readAxis = (axis) => {
        const style = document.getElementById(`bounce-${axis}-style`).value;
        const speed = clampNumber(document.getElementById(`bounce-${axis}-speed`).value, 1, 200, 10);
        const staticSize = clampNumber(document.getElementById(`bounce-${axis}-static`).value, 1, 400, 100);
        const range = sanitizeRange(
            document.getElementById(`bounce-${axis}-min`).value,
            document.getElementById(`bounce-${axis}-max`).value,
            70,
            130
        );
        return { style, speed, staticSize, min: range.min, max: range.max };
    };
    return {
        horizontal: readAxis('h'),
        vertical: readAxis('v'),
    };
};

const readRandomSettings = () => {
    const readAxis = (axis) => {
        const enabled = document.getElementById(`random-${axis}`).checked;
        const range = sanitizeRange(
            document.getElementById(`random-${axis}-min`).value,
            document.getElementById(`random-${axis}-max`).value,
            60,
            140
        );
        return { enabled, min: range.min, max: range.max };
    };
    return {
        horizontal: readAxis('h'),
        vertical: readAxis('v'),
    };
};

const readTrimSettings = () => ({
    fuzz: clampNumber(document.getElementById('trim-fuzz').value, 0, 100, 3),
    padding: clampNumber(document.getElementById('trim-padding').value, 0, 50, 1),
});

const gatherSettings = () => {
    const selectedMode = modes.find((mode) => document.getElementById(mode)?.checked) || 'bounce';
    const crfValue = clampNumber(document.getElementById('crf').value, 0, 63, 42);
    const fpsValueRaw = document.getElementById('output-fps').value;
    const fpsOverride = fpsValueRaw ? clampNumber(fpsValueRaw, 1, 240, null) : null;
    const includeAudio = document.getElementById('include-audio').checked;

    const settings = { mode: selectedMode, crf: crfValue.toString(), includeAudio };
    if (fpsOverride) settings.fpsOverride = fpsOverride.toString();

    if (selectedMode === 'bounce') settings.bounce = readBounceSettings();
    if (selectedMode === 'random') settings.random = readRandomSettings();
    if (selectedMode === 'trim') settings.trim = readTrimSettings();
    if (selectedMode === 'timeline') settings.timeline = getTimelineRows();

    return settings;
};

const downloadURL = (data, fileName) => {
    const a = document.createElement('a');
    a.href = data;
    a.download = fileName;
    document.body.appendChild(a);
    a.style.display = 'none';
    a.click();
    a.remove();
};

const downloadBlob = (data, fileName, mimeType) => {
    const blob = new Blob([data], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    downloadURL(url, fileName);
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

const processVideo = (file, options, onStatus) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'process.php');
    xhr.responseType = 'blob';

    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / Math.max(1, event.total)) * 30);
            onStatus({ type: 'upload', percent });
        } else {
            onStatus({ type: 'upload' });
        }
    };

    xhr.upload.onload = () => {
        onStatus({ type: 'processing' });
    };

    xhr.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = 30 + Math.round((event.loaded / Math.max(1, event.total)) * 70);
            onStatus({ type: 'download', percent });
        } else {
            onStatus({ type: 'download' });
        }
    };

    xhr.onerror = () => {
        reject(new Error('Network error while communicating with ffmpeg.'));
    };

    xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
            return;
        }
        if (xhr.response) {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    reject(new Error(data.error || 'Unable to create WebM.'));
                } catch (err) {
                    reject(new Error(reader.result || 'Unable to create WebM.'));
                }
            };
            reader.onerror = () => reject(new Error('Unable to decode error response.'));
            reader.readAsText(xhr.response);
        } else {
            reject(new Error(`Unable to create WebM (HTTP ${xhr.status}).`));
        }
    };

    const formData = new FormData();
    formData.append('video', file);
    formData.append('settings', JSON.stringify(options));
    xhr.send(formData);
});

startBtn.addEventListener('click', () => {
    if (!filePicker.files || !filePicker.files.length) {
        alert('Pick a file first!');
        return;
    }
    const settings = gatherSettings();
    if (settings.mode === 'timeline') {
        const validation = validateTimelineKeyframes(settings.timeline || []);
        if (!validation.ok) {
            alert(validation.message);
            return;
        }
    }

    const inputFile = filePicker.files[0];
    if (uploadLimitInfo && uploadLimitInfo.bytes > 0 && inputFile.size > uploadLimitInfo.bytes) {
        const fileSize = formatBytes(inputFile.size);
        const limitSize = formatBytes(uploadLimitInfo.bytes);
        const sourceLabel = describeLimitSources(uploadLimitInfo.sources);
        alert(
            `The selected file is ${fileSize}, but the PHP server currently limits uploads to ${limitSize} (${sourceLabel}).\n` +
            'Increase upload_max_filesize and post_max_size in your php.ini or .user.ini, then restart the server to work with larger videos.'
        );
        return;
    }
    const filename = inputFile.name.replace(/\.[^/.]+$/, '_weirdm.webm');
    startBtn.disabled = true;
    setProgress('Preparing…');

    processVideo(inputFile, settings, (status) => {
        if (status.type === 'upload') {
            if (typeof status.percent === 'number') {
                setProgress(`Uploading ${status.percent}%`, status.percent);
            } else {
                setProgress('Uploading…', 10);
            }
        } else if (status.type === 'processing') {
            setProgress('Processing…');
        } else if (status.type === 'download') {
            if (typeof status.percent === 'number') {
                setProgress(`Finalising ${status.percent}%`, status.percent);
            } else {
                setProgress('Finalising…');
            }
        }
    }).then((blob) => {
        downloadBlob(blob, filename, 'video/webm');
        startBtn.disabled = false;
        setProgress('Create WebM');
    }).catch((err) => {
        console.error(err);
        alert(err.message || 'Something went wrong while creating the WebM. Check the console for details.');
        startBtn.disabled = false;
        setProgress('Create WebM');
    });
});

initializeTimeline();
updateModeVisibility();
updateBounceFieldState();
updateRandomFieldState();
