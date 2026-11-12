"use strict";

(() => {
  const expressions = [
    { key: "happy", label: "Happy", symbol: "☺", color: "#61d6ae" },
    { key: "sad", label: "Sad", symbol: "☹", color: "#70a7ff" },
    { key: "angry", label: "Angry", symbol: "!", color: "#ff7785" },
    { key: "fearful", label: "Fearful", symbol: "?", color: "#b194ff" },
    { key: "disgusted", label: "Disgusted", symbol: "↘", color: "#d0a6ff" },
    { key: "surprised", label: "Surprised", symbol: "◉", color: "#ffbf69" },
    { key: "neutral", label: "Neutral", symbol: "—", color: "#91a0b6" },
  ];

  const modelPaths = {
    detector: "models/tiny_face_detector/",
    expressions: "models/face_expression/",
  };
  const ui = {
    video: document.querySelector("#camera-video"),
    overlay: document.querySelector("#face-overlay"),
    stage: document.querySelector("#camera-stage"),
    placeholder: document.querySelector("#camera-placeholder"),
    noFace: document.querySelector("#no-face-message"),
    start: document.querySelector("#start-camera"),
    stop: document.querySelector("#stop-camera"),
    retry: document.querySelector("#retry-models"),
    hint: document.querySelector("#camera-hint"),
    modelStatus: document.querySelector("#model-status"),
    cameraIndicator: document.querySelector("#camera-indicator"),
    cameraState: document.querySelector("#camera-state"),
    faceStat: document.querySelector("#face-stat"),
    faceStatFoot: document.querySelector("#face-stat-foot"),
    durationStat: document.querySelector("#duration-stat"),
    frameStat: document.querySelector("#frame-stat"),
    detectionStat: document.querySelector("#detection-stat"),
    dominantLabel: document.querySelector("#dominant-label"),
    dominantSymbol: document.querySelector("#dominant-symbol"),
    dominantConfidence: document.querySelector("#dominant-confidence"),
    dominantMeter: document.querySelector("#dominant-meter"),
    expressionOrb: document.querySelector("#expression-orb"),
    expressionList: document.querySelector("#expression-list"),
    distributionChart: document.querySelector("#distribution-chart"),
    chartLegend: document.querySelector("#chart-legend"),
    activityChart: document.querySelector("#activity-chart"),
    activityTotal: document.querySelector("#activity-total"),
    detectionRate: document.querySelector("#detection-rate"),
    mostSeen: document.querySelector("#most-seen"),
    totalFaceReads: document.querySelector("#total-face-reads"),
  };

  const state = {
    modelsReady: false,
    stream: null,
    running: false,
    analyzing: false,
    timer: null,
    startedAt: null,
    elapsedTimer: null,
    frames: 0,
    faces: 0,
    framesWithFaces: 0,
    expressionCounts: Object.fromEntries(expressions.map(({ key }) => [key, 0])),
    activity: [],
    resizeObserver: null,
  };

  const expressionRows = new Map();
  for (const expression of expressions) {
    const row = document.createElement("div");
    row.className = "expression-row";
    row.style.setProperty("--expression-color", expression.color);
    row.innerHTML = `<span class="expression-name"><i class="expression-swatch"></i>${expression.label}</span><span class="expression-track"><span class="expression-fill"></span></span><span class="expression-score">—</span>`;
    ui.expressionList.append(row);
    expressionRows.set(expression.key, {
      row,
      fill: row.querySelector(".expression-fill"),
      score: row.querySelector(".expression-score"),
    });

    const legend = document.createElement("span");
    legend.className = "legend-item";
    legend.style.setProperty("--expression-color", expression.color);
    legend.innerHTML = `<i></i>${expression.label}`;
    ui.chartLegend.append(legend);
  }

  function setHint(message, type = "") {
    ui.hint.textContent = message;
    ui.hint.classList.toggle("error", type === "error");
    ui.hint.classList.toggle("success", type === "success");
  }

  function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function getDominantExpression(values) {
    return expressions.reduce((best, item) => values[item.key] > values[best.key] ? item : best, expressions[0]);
  }

  function drawDistributionChart() {
    const canvas = ui.distributionChart;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    context.clearRect(0, 0, bounds.width, bounds.height);

    const total = Object.values(state.expressionCounts).reduce((sum, count) => sum + count, 0);
    const left = 2;
    const right = bounds.width - 2;
    const y = Math.round(bounds.height / 2);
    const height = 11;
    const radius = 5.5;

    context.fillStyle = "#29303c";
    context.beginPath();
    context.roundRect(left, y, right - left, height, radius);
    context.fill();

    if (!total) return;
    context.save();
    context.beginPath();
    context.roundRect(left, y, right - left, height, radius);
    context.clip();
    let x = left;
    for (const item of expressions) {
      const count = state.expressionCounts[item.key];
      if (!count) continue;
      const segment = (right - left) * count / total;
      context.fillStyle = item.color;
      context.fillRect(x, y, segment + .5, height);
      x += segment;
    }
    context.restore();
  }

  function drawActivityChart() {
    const canvas = ui.activityChart;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    context.clearRect(0, 0, bounds.width, bounds.height);

    const padding = { top: 9, right: 4, bottom: 7, left: 4 };
    const width = bounds.width - padding.left - padding.right;
    const height = bounds.height - padding.top - padding.bottom;
    const maxValue = Math.max(2, ...state.activity);
    const points = state.activity.length ? state.activity : Array(18).fill(0);
    const coordinates = points.map((value, index) => ({
      x: padding.left + (points.length < 2 ? width : width * index / (points.length - 1)),
      y: padding.top + height - (value / maxValue) * height,
    }));

    context.strokeStyle = "rgba(151, 162, 183, .12)";
    context.lineWidth = 1;
    for (let line = 0; line < 3; line += 1) {
      const y = padding.top + height * line / 2;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(bounds.width - padding.right, y);
      context.stroke();
    }

    if (state.activity.length) {
      context.beginPath();
      context.moveTo(coordinates[0].x, padding.top + height);
      for (const point of coordinates) context.lineTo(point.x, point.y);
      context.lineTo(coordinates[coordinates.length - 1].x, padding.top + height);
      context.closePath();
      const gradient = context.createLinearGradient(0, padding.top, 0, bounds.height);
      gradient.addColorStop(0, "rgba(154, 131, 255, .2)");
      gradient.addColorStop(1, "rgba(154, 131, 255, 0)");
      context.fillStyle = gradient;
      context.fill();

      context.beginPath();
      coordinates.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.strokeStyle = "#a18cff";
      context.lineWidth = 2;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
      const last = coordinates[coordinates.length - 1];
      context.beginPath();
      context.arc(last.x, last.y, 3, 0, Math.PI * 2);
      context.fillStyle = "#c1b4ff";
      context.fill();
    }
  }

  function renderStatistics() {
    ui.frameStat.textContent = state.frames.toLocaleString();
    ui.detectionStat.textContent = state.faces.toLocaleString();
    ui.activityTotal.textContent = state.faces.toLocaleString();
    ui.totalFaceReads.textContent = state.faces.toLocaleString();
    ui.detectionRate.textContent = `${state.frames ? Math.round(state.framesWithFaces / state.frames * 100) : 0}% detection rate`;
    const mostSeen = expressions.reduce((best, item) => state.expressionCounts[item.key] > state.expressionCounts[best.key] ? item : best, expressions[0]);
    ui.mostSeen.textContent = state.expressionCounts[mostSeen.key] ? mostSeen.label : "—";
    drawDistributionChart();
    drawActivityChart();
  }

  function renderExpressions(values, dominant) {
    for (const item of expressions) {
      const score = Math.max(0, Math.min(1, Number(values[item.key]) || 0));
      const row = expressionRows.get(item.key);
      row.fill.style.width = `${score * 100}%`;
      row.score.textContent = `${Math.round(score * 100)}%`;
      row.row.classList.toggle("is-dominant", item.key === dominant.key);
    }
    ui.dominantLabel.textContent = dominant.label;
    ui.dominantSymbol.textContent = dominant.symbol;
    ui.dominantConfidence.textContent = `${Math.round((Number(values[dominant.key]) || 0) * 100)}%`;
    ui.dominantMeter.style.width = `${Math.max(0, Math.min(100, (Number(values[dominant.key]) || 0) * 100))}%`;
    ui.expressionOrb.style.borderColor = `${dominant.color}55`;
    ui.expressionOrb.style.color = dominant.color;
    ui.expressionOrb.style.background = `radial-gradient(circle at 35% 30%, ${dominant.color}2b, ${dominant.color}0d)`;
  }

  function clearOverlay() {
    const context = ui.overlay.getContext("2d");
    context.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
  }

  function drawFaceBoxes(results) {
    const context = ui.overlay.getContext("2d");
    const width = ui.video.videoWidth;
    const height = ui.video.videoHeight;
    if (ui.overlay.width !== width || ui.overlay.height !== height) {
      ui.overlay.width = width;
      ui.overlay.height = height;
    }
    context.clearRect(0, 0, width, height);
    const scale = width / 640;
    context.lineWidth = Math.max(2, 2.2 * scale);
    context.font = `600 ${Math.max(14, 15 * scale)}px system-ui, sans-serif`;
    context.textBaseline = "middle";

    for (const result of results) {
      const box = result.detection.box;
      const dominant = getDominantExpression(result.expressions);
      const x = box.x;
      const y = Math.max(5, box.y);
      const label = `${dominant.label} · ${Math.round((Number(result.expressions[dominant.key]) || 0) * 100)}%`;
      const labelHeight = Math.max(27, 29 * scale);
      const labelWidth = context.measureText(label).width + 20 * scale;
      context.strokeStyle = dominant.color;
      context.fillStyle = dominant.color;
      context.beginPath();
      context.roundRect(x, y, box.width, box.height, 7 * scale);
      context.stroke();
      const labelY = Math.max(0, y - labelHeight);
      context.beginPath();
      context.roundRect(x, labelY, labelWidth, labelHeight, 5 * scale);
      context.fill();
      context.fillStyle = "#131720";
      context.fillText(label, x + 10 * scale, labelY + labelHeight / 2);
    }
  }

  function mapCameraError(error) {
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      return "Camera access requires HTTPS. Open this site through a secure connection or localhost.";
    }
    switch (error?.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Camera permission was denied. Allow camera access in your browser settings, then try again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No camera was found. Connect a camera and try again.";
      case "NotReadableError":
      case "TrackStartError":
        return "The camera is already in use or unavailable. Close other camera apps and try again.";
      case "OverconstrainedError":
        return "The camera does not support the requested settings. Try another camera.";
      case "SecurityError":
        return "The browser blocked camera access. Open this page over HTTPS or localhost.";
      case "AbortError":
        return "The camera could not start. Please try again.";
      default:
        return "Camera access failed. Check your browser permissions and camera connection, then try again.";
    }
  }

  async function loadModels() {
    ui.start.disabled = true;
    ui.retry.hidden = true;
    ui.modelStatus.textContent = "Preparing local models…";
    setHint("Loading local expression models…");
    try {
      if (!window.faceapi) throw new Error("The local face-api.js library did not load.");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelPaths.detector),
        faceapi.nets.faceExpressionNet.loadFromUri(modelPaths.expressions),
      ]);
      state.modelsReady = true;
      ui.modelStatus.textContent = "Models ready · Local inference";
      ui.start.disabled = false;
      setHint("Models are ready. Start the camera when you’re ready.", "success");
    } catch (error) {
      state.modelsReady = false;
      ui.modelStatus.textContent = "Model loading failed";
      ui.cameraIndicator.classList.add("error");
      setHint(`Could not load local models. ${error.message || "Check that the files in web/models are available, then retry."}`, "error");
      ui.retry.hidden = false;
    }
  }

  async function startCamera() {
    if (!state.modelsReady || state.running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setHint("This browser does not support webcam access. Try a current browser over HTTPS or localhost.", "error");
      ui.cameraIndicator.classList.add("error");
      return;
    }
    ui.start.disabled = true;
    ui.cameraState.textContent = "Requesting access…";
    setHint("Waiting for camera permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (!stream.getVideoTracks().length) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException("No video track was provided.", "NotFoundError");
      }
      state.stream = stream;
      ui.video.srcObject = stream;
      await new Promise((resolve, reject) => {
        if (ui.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          resolve();
          return;
        }
        ui.video.addEventListener("loadedmetadata", resolve, { once: true });
        ui.video.addEventListener("error", () => reject(new Error("The camera preview could not be opened.")), { once: true });
      });
      await ui.video.play();
      state.running = true;
      state.startedAt = Date.now();
      ui.video.classList.add("visible");
      ui.overlay.classList.add("visible");
      ui.placeholder.hidden = true;
      ui.noFace.hidden = false;
      ui.cameraState.textContent = "Camera live";
      ui.cameraIndicator.classList.remove("error");
      ui.cameraIndicator.classList.add("active");
      ui.start.disabled = true;
      ui.stop.disabled = false;
      ui.faceStat.textContent = "0";
      ui.faceStatFoot.textContent = "No face detected yet";
      ui.dominantLabel.textContent = "Looking for a face";
      ui.dominantSymbol.textContent = "…";
      ui.dominantConfidence.textContent = "—";
      ui.dominantMeter.style.width = "0";
      setHint("Live analysis is running locally in your browser.", "success");
      state.elapsedTimer = window.setInterval(() => {
        if (state.startedAt) ui.durationStat.textContent = formatDuration((Date.now() - state.startedAt) / 1000);
      }, 1000);
      analyzeNextFrame();
    } catch (error) {
      stopCamera(false);
      ui.cameraState.textContent = "Camera off";
      ui.cameraIndicator.classList.remove("active");
      ui.cameraIndicator.classList.add("error");
      ui.start.disabled = !state.modelsReady;
      setHint(mapCameraError(error), "error");
    }
  }

  async function analyzeNextFrame() {
    if (!state.running || state.analyzing) return;
    if (ui.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      state.timer = window.setTimeout(analyzeNextFrame, 200);
      return;
    }
    state.analyzing = true;
    try {
      const results = await faceapi.detectAllFaces(
        ui.video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }),
      ).withFaceExpressions();
      if (!state.running) return;
      state.frames += 1;
      const faceCount = results.length;
      state.faces += faceCount;
      if (faceCount) {
        state.framesWithFaces += 1;
        ui.faceStat.textContent = faceCount.toString();
        ui.faceStatFoot.textContent = `${faceCount} ${faceCount === 1 ? "face" : "faces"} in current frame`;
        ui.noFace.hidden = true;
        drawFaceBoxes(results);
        for (const result of results) {
          const dominant = getDominantExpression(result.expressions);
          state.expressionCounts[dominant.key] += 1;
        }
        const primary = results.reduce((best, result) => result.detection.score > best.detection.score ? result : best);
        renderExpressions(primary.expressions, getDominantExpression(primary.expressions));
      } else {
        ui.faceStat.textContent = "0";
        ui.faceStatFoot.textContent = "No face detected";
        ui.noFace.hidden = false;
        clearOverlay();
      }
      state.activity.push(faceCount);
      if (state.activity.length > 32) state.activity.shift();
      renderStatistics();
    } catch (error) {
      if (state.running) {
        stopCamera();
        ui.cameraIndicator.classList.add("error");
        setHint(`Live analysis stopped because a frame could not be processed. ${error.message || ""}`.trim(), "error");
      }
    } finally {
      state.analyzing = false;
      if (state.running) state.timer = window.setTimeout(analyzeNextFrame, 250);
    }
  }

  function stopCamera(showMessage = true) {
    state.running = false;
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.timer = null;
    if (state.elapsedTimer !== null) window.clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    ui.video.pause();
    ui.video.srcObject = null;
    ui.video.classList.remove("visible");
    ui.overlay.classList.remove("visible");
    ui.placeholder.hidden = false;
    ui.noFace.hidden = true;
    clearOverlay();
    ui.cameraIndicator.classList.remove("active");
    ui.cameraState.textContent = "Camera off";
    ui.stop.disabled = true;
    ui.start.disabled = !state.modelsReady;
    ui.durationStat.textContent = state.startedAt ? formatDuration((Date.now() - state.startedAt) / 1000) : "00:00";
    state.startedAt = null;
    ui.faceStat.textContent = "—";
    ui.faceStatFoot.textContent = "Start camera to begin";
    ui.dominantLabel.textContent = "Waiting for camera";
    ui.dominantSymbol.textContent = "—";
    ui.dominantConfidence.textContent = "—";
    ui.dominantMeter.style.width = "0";
    ui.expressionOrb.removeAttribute("style");
    for (const item of expressions) {
      const row = expressionRows.get(item.key);
      row.fill.style.width = "0";
      row.score.textContent = "—";
      row.row.classList.remove("is-dominant");
    }
    if (showMessage) setHint("Camera stopped. Session analytics remain visible until you close or reload this page.");
  }

  function resetSession() {
    state.frames = 0;
    state.faces = 0;
    state.framesWithFaces = 0;
    state.expressionCounts = Object.fromEntries(expressions.map(({ key }) => [key, 0]));
    state.activity = [];
    renderStatistics();
  }

  ui.start.addEventListener("click", startCamera);
  ui.stop.addEventListener("click", () => stopCamera());
  ui.retry.addEventListener("click", loadModels);
  window.addEventListener("resize", () => {
    drawDistributionChart();
    drawActivityChart();
  });
  if ("ResizeObserver" in window) {
    state.resizeObserver = new ResizeObserver(() => {
      drawDistributionChart();
      drawActivityChart();
    });
    state.resizeObserver.observe(ui.distributionChart);
    state.resizeObserver.observe(ui.activityChart);
  }
  window.addEventListener("beforeunload", () => {
    stopCamera(false);
    state.resizeObserver?.disconnect();
  });

  resetSession();
  loadModels();
})();
