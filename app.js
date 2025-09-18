// Cross-Origin-Embedder-Policy: require-corp
// Cross-Origin-Opener-Policy: same-origin

const { createFFmpeg } = FFmpeg;

let ffmpeg = createFFmpeg({ log: true });
let detectedFps = "15";
let fps = "15";
let crf = "42";
let mode = "bounce";

const filePicker = document.getElementById("filepicker");
const startBtn = document.querySelector(".button.start");
const timelineBody = document.getElementById("timeline-rows");

const setProgress = (percentage) => {
    if (percentage >= 0) {
        const pct = Math.min(100, Math.max(0, percentage));
        startBtn.innerText = `Processing ${pct}%`;
        startBtn.style.background = `linear-gradient(90deg, rgba(0, 175, 244, 0.85) ${pct}%, rgba(45, 125, 70, 0.4) ${pct}%)`;
    } else {
        startBtn.innerText = "Create WebM";
        startBtn.style.background = "";
    }
};

const recycleFFmpeg = async () => {
    const files = [];
    try {
        files.push(['input.avi', ffmpeg.FS('readFile', 'input.avi')]);
        ffmpeg.FS('unlink', 'input.avi');
    } catch {}
    let i = 0;
    while (true) {
        i++;
        const fn = i.toString().padStart(6, '0') + '.png';
        try {
            files.push([fn, ffmpeg.FS('readFile', fn)]);
            ffmpeg.FS('unlink', fn);
        } catch {
            break;
        }
    }
    i = 0;
    while (true) {
        const fn = i.toString() + '.webm';
        try {
            files.push([fn, ffmpeg.FS('readFile', fn)]);
            ffmpeg.FS('unlink', fn);
        } catch {
            break;
        }
        i++;
    }
    try {
        ffmpeg.exit();
    } catch {}
    ffmpeg = createFFmpeg({ log: true });
    if (!ffmpeg.isLoaded()) await ffmpeg.load();
    for (let j = 0; j < files.length; j++) {
        ffmpeg.FS('writeFile', files[j][0], files[j][1]);
        files[j][1] = null;
    }
};

const makeWebmPart = async (inArgs, webmCount) => {
    let concat = "";
    inArgs.forEach((arg) => {
        concat += `file ${arg}\n`;
    });
    ffmpeg.FS('writeFile', 'concat.txt', Uint8Array.from(concat.split('').map(letter => letter.charCodeAt(0))));
    await ffmpeg.run('-y', '-f', 'concat', '-i', 'concat.txt', '-vf', `settb=AVTB,setpts=N/${fps}/TB,fps=${fps}`, '-pix_fmt', 'yuv420p', '-crf', crf, '-r', fps, webmCount + '.webm');
    if (webmCount % 10 === 0) await recycleFFmpeg();
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

const easingFunctions = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => 1 - Math.pow(1 - t, 2),
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

const modes = ["bounce", "random", "timeline", "trim"];

const updateModeVisibility = () => {
    modes.forEach((m) => {
        const container = document.getElementById(`${m}-options`);
        if (!container) return;
        const radio = document.getElementById(m);
        container.hidden = !radio.checked;
    });
};

document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener('change', () => {
        mode = input.value;
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
    timelineBody.appendChild(createTimelineRow({ time: 0, width: 100, height: 100, easing: 'linear', lockTime: true, lockRemove: true, disableEasing: true }));
    timelineBody.appendChild(createTimelineRow({ time: 100, width: 100, height: 100, easing: 'linear', lockTime: true, lockRemove: true }));
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
        const range = sanitizeRange(document.getElementById(`bounce-${axis}-min`).value, document.getElementById(`bounce-${axis}-max`).value, 70, 130);
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
        const range = sanitizeRange(document.getElementById(`random-${axis}-min`).value, document.getElementById(`random-${axis}-max`).value, 60, 140);
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

const createResizeArgs = (size) => [
    'convert',
    'in.png',
    '-resize',
    size,
    '-set',
    'filename:mysize',
    '%wx%h',
    '%[filename:mysize]',
];

const createTrimArgs = (settings) => {
    const args = ['convert', 'in.png'];
    if (settings.fuzz > 0) {
        args.push('-fuzz', `${settings.fuzz}%`);
    }
    args.push('-trim');
    if (settings.padding > 0) {
        const pad = `${settings.padding}x${settings.padding}`;
        args.push('-shave', pad);
    }
    args.push('+repage', '-set', 'filename:mysize', '%wx%h', '%[filename:mysize]');
    return args;
};

const computeBounceValue = (frame, fpsValue, axisSettings) => {
    if (axisSettings.style === 'none') {
        return Math.round(axisSettings.staticSize);
    }
    const { min, max, speed, style } = axisSettings;
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    const amplitude = (high - low) / 2;
    const center = low + amplitude;
    const trig = style === 'sin' ? Math.sin : Math.cos;
    const t = (frame * speed) / Number(fpsValue || 1);
    const value = center + trig(t) * amplitude;
    return Math.round(Math.max(1, value));
};

const getBounceResize = (frame, fpsValue, settings) => {
    const horizontal = computeBounceValue(frame, fpsValue, settings.horizontal);
    const vertical = computeBounceValue(frame, fpsValue, settings.vertical);
    return `${horizontal}%x${vertical}%`;
};

const randomBetween = (min, max) => Math.round(min + Math.random() * (max - min));

const getRandomResize = (settings) => {
    const width = settings.horizontal.enabled ? randomBetween(settings.horizontal.min, settings.horizontal.max) : 100;
    const height = settings.vertical.enabled ? randomBetween(settings.vertical.min, settings.vertical.max) : 100;
    return `${width}%x${height}%`;
};

const getTimelineResize = (frame, framesTotal, keyframes) => {
    if (!keyframes.length) return '100%x100%';
    if (keyframes.length === 1) {
        const only = keyframes[0];
        return `${only.width}%x${only.height}%`;
    }
    const total = Math.max(1, framesTotal - 1);
    const progressPercent = ((frame - 1) / total) * 100;
    let previous = keyframes[0];
    for (let i = 1; i < keyframes.length; i++) {
        const current = keyframes[i];
        if (progressPercent <= current.time || i === keyframes.length - 1) {
            const span = current.time - previous.time;
            const spanSafe = span <= 0 ? 1 : span;
            const local = (progressPercent - previous.time) / spanSafe;
            const eased = easingFunctions[current.easing]?.(Math.min(1, Math.max(0, local))) ?? easingFunctions.linear(Math.min(1, Math.max(0, local)));
            const width = Math.round(previous.width + (current.width - previous.width) * eased);
            const height = Math.round(previous.height + (current.height - previous.height) * eased);
            return `${width}%x${height}%`;
        }
        previous = current;
    }
    const last = keyframes[keyframes.length - 1];
    return `${last.width}%x${last.height}%`;
};

const gatherSettings = () => {
    const selectedMode = modes.find((m) => document.getElementById(m)?.checked) || 'bounce';
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

const makeVideo = async (file, options) => {
    setProgress(0);
    if (!ffmpeg.isLoaded()) await ffmpeg.load();
    setProgress(5);
    ffmpeg.FS('writeFile', 'input.avi', file);

    detectedFps = '15';
    ffmpeg.setLogger(({ type, message }) => {
        if (type === 'fferr' && message.includes(' fps')) {
            const parts = message.split(' fps')[0].trim().split(' ');
            detectedFps = parts.pop();
        }
    });
    await ffmpeg.run('-y', '-i', 'input.avi');
    ffmpeg.setLogger(() => {});

    fps = options.fpsOverride || detectedFps || '15';
    crf = options.crf || '42';

    await ffmpeg.run('-y', '-i', 'input.avi', '%06d.png');
    setProgress(10);

    let framesTotal = 0;
    while (true) {
        framesTotal++;
        const fn = framesTotal.toString().padStart(6, '0') + '.png';
        try {
            ffmpeg.FS('readFile', fn);
        } catch {
            break;
        }
    }

    const timelineKeyframes = options.mode === 'timeline' ? options.timeline : [];
    let lastRes;
    let webmCount = 0;
    let inArgs = [];
    for (let frame = 1; frame < framesTotal; frame++) {
        const fn = frame.toString().padStart(6, '0') + '.png';
        const png = ffmpeg.FS('readFile', fn);
        let args;
        if (options.mode === 'trim') {
            args = createTrimArgs(options.trim || readTrimSettings());
        } else {
            const size = {
                bounce: () => getBounceResize(frame, Number(fps), options.bounce || readBounceSettings()),
                random: () => getRandomResize(options.random || readRandomSettings()),
                timeline: () => getTimelineResize(frame, framesTotal, timelineKeyframes || []),
            }[options.mode]?.() || '100%x100%';
            args = createResizeArgs(size);
        }
        const out = await Magick.Call([{ name: 'in.png', content: png }], args);
        const res = out[0].name;
        ffmpeg.FS('writeFile', fn, out[0].buffer);
        if (!lastRes) lastRes = res;
        if (lastRes !== res) {
            await makeWebmPart(inArgs, webmCount);
            webmCount++;
            lastRes = res;
            inArgs = [];
        }
        setProgress(10 + Math.floor((frame / Math.max(1, framesTotal - 1)) * 80));
        inArgs.push(fn);
    }
    await makeWebmPart(inArgs, webmCount);
    webmCount++;
    setProgress(90);

    let concat = "";
    for (let i = 0; i < webmCount; i++) {
        concat += `file ${i}.webm\n`;
    }
    ffmpeg.FS('writeFile', 'concat.txt', Uint8Array.from(concat.split('').map(letter => letter.charCodeAt(0))));
    await ffmpeg.run('-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'vid.webm');
    setProgress(95);
    const finalArgs = ['-y', '-i', 'vid.webm', '-i', 'input.avi', '-c:v', 'copy', '-map', '0:v'];
    if (options.includeAudio) {
        finalArgs.push('-map', '1:a?');
    }
    finalArgs.push('-metadata', 'title=WeirdM', 'out.webm');
    await ffmpeg.run(...finalArgs);
    setProgress(100);
    return ffmpeg.FS('readFile', 'out.webm');
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

    const reader = new FileReader();
    const filename = filePicker.files[0].name.replace(/\.[^/.]+$/, "_weirdm.webm");
    reader.onload = function () {
        const array = new Uint8Array(this.result);
        mode = settings.mode;
        crf = settings.crf;
        setProgress(0);
        makeVideo(array, settings).then((final) => {
            downloadBlob(final, filename, 'video/webm');
            startBtn.disabled = false;
            setProgress(-1);
            try {
                ffmpeg.exit();
            } catch {}
        }).catch((err) => {
            console.error(err);
            alert('Something went wrong while creating the WebM. Check the console for details.');
            startBtn.disabled = false;
            setProgress(-1);
        });
    };
    reader.readAsArrayBuffer(filePicker.files[0]);
    startBtn.disabled = true;
    startBtn.innerText = 'Preparing…';
    startBtn.style.background = '';
});

initializeTimeline();
updateModeVisibility();
updateBounceFieldState();
updateRandomFieldState();
