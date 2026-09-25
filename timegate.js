(function (root) {
  "use strict";

  const RELEASE_AT = "2026-09-25T15:05:00Z";
  const RELEASE_AT_MS = Date.parse(RELEASE_AT);
  const TIME_ENDPOINT = "https://utctime.app/api/timezone/Etc/UTC";
  const REQUEST_TIMEOUT_MS = 10000;
  const RETRY_DELAY_MS = 5000;
  const REFRESH_INTERVAL_MS = 60000;

  function formatRemaining(remainingMs) {
    const milliseconds = Number.isFinite(Number(remainingMs)) ? Number(remainingMs) : 0;
    const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const text = [days, hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
    return Object.freeze({ totalSeconds, days, hours, minutes, seconds, text });
  }

  function createTimegate(options = {}) {
    const fetchTime = options.fetch || (root && typeof root.fetch === "function" ? root.fetch.bind(root) : null);
    const monotonicNow = options.monotonicNow || options.now || (() => {
      if (root && root.performance && typeof root.performance.now === "function") return root.performance.now();
      if (typeof performance === "object" && typeof performance.now === "function") return performance.now();
      return 0;
    });
    const schedule = options.setTimeout || options.schedule || (root && root.setTimeout ? root.setTimeout.bind(root) : setTimeout);
    const cancel = options.clearTimeout || options.cancel || (root && root.clearTimeout ? root.clearTimeout.bind(root) : clearTimeout);
    const AbortControllerClass = options.AbortController || (root && root.AbortController);
    const visibilityTarget = options.visibilityTarget || null;
    const pageTarget = options.pageTarget || null;
    const logger = options.logger || (root && root.console ? root.console : null);
    const listeners = new Set();

    let state = "checking";
    let remainingSeconds = null;
    let formatted = null;
    let started = false;
    let disposed = false;
    let activeRequest = null;
    let retryTimer = null;
    let countdownTimer = null;
    let periodicTimer = null;
    let sample = null;
    let unlockedNotified = false;

    function log(level, message, details, error) {
      if (!logger || typeof logger[level] !== "function") return;
      logger[level]("[timegate]", message, details, error || "");
    }

    function requestDetails(request) {
      return {
        endpoint: TIME_ENDPOINT,
        reason: request.reason,
        elapsedMs: Math.max(0, Math.round(monotonicNow() - request.startedAt)),
        pageOrigin: root && root.location ? root.location.origin : undefined,
        online: root && root.navigator ? root.navigator.onLine : undefined,
        responseStatus: request.responseStatus
      };
    }

    function isVisible() {
      return !visibilityTarget || visibilityTarget.visibilityState !== "hidden";
    }

    function clearTimer(timerName) {
      if (timerName === "retry" && retryTimer !== null) {
        cancel(retryTimer);
        retryTimer = null;
      }
      if (timerName === "countdown" && countdownTimer !== null) {
        cancel(countdownTimer);
        countdownTimer = null;
      }
      if (timerName === "periodic" && periodicTimer !== null) {
        cancel(periodicTimer);
        periodicTimer = null;
      }
    }

    function clearSchedule() {
      clearTimer("retry");
      clearTimer("countdown");
      clearTimer("periodic");
    }

    function emit(nextState, nextRemainingSeconds, nextFormatted = null) {
      state = nextState;
      remainingSeconds = nextRemainingSeconds;
      formatted = nextFormatted;
      const snapshot = Object.freeze({ state, remainingSeconds, formatted });
      listeners.forEach((listener) => listener(snapshot));
    }

    function emitCountdown() {
      if (disposed || state === "unlocked" || !sample) return;
      const estimatedExternalNow = sample.externalMs + (monotonicNow() - sample.anchor);
      const nextFormatted = formatRemaining(RELEASE_AT_MS - estimatedExternalNow);
      emit("countdown", nextFormatted.totalSeconds, nextFormatted);
      if (nextFormatted.totalSeconds === 0) {
        clearTimer("countdown");
        emit("checking", 0, formatRemaining(0));
        requestVerification("release-boundary");
        return;
      }
      if (isVisible()) {
        const nextTickMs = Math.max(50, Math.min(1000, (nextFormatted.totalSeconds * 1000) - Math.max(0, RELEASE_AT_MS - estimatedExternalNow) + 20));
        countdownTimer = schedule(() => {
          countdownTimer = null;
          emitCountdown();
        }, nextTickMs);
      }
    }

    function scheduleCountdown() {
      clearTimer("countdown");
      if (!disposed && state !== "unlocked" && sample && isVisible()) emitCountdown();
    }

    function schedulePeriodicRefresh() {
      clearTimer("periodic");
      if (disposed || state !== "countdown" || !sample || !isVisible()) return;
      periodicTimer = schedule(() => {
        periodicTimer = null;
        requestVerification("periodic");
      }, REFRESH_INTERVAL_MS);
    }

    function scheduleRetry() {
      clearTimer("retry");
      retryTimer = schedule(() => {
        retryTimer = null;
        requestVerification("retry");
      }, RETRY_DELAY_MS);
    }

    function invalidateSample() {
      sample = null;
      clearTimer("countdown");
      clearTimer("periodic");
    }

    function parseExternalTime(response) {
      if (!response || (typeof response.ok === "boolean" ? !response.ok : !(response.status >= 200 && response.status < 300))) {
        const error = new Error("A resposta do serviço de hora não foi bem-sucedida.");
        error.code = "HTTP_STATUS";
        if (response && Number.isFinite(response.status)) error.status = response.status;
        throw error;
      }
      return Promise.resolve().then(() => response.json()).then((body) => {
        const value = body && body.utc_datetime;
        if (typeof value !== "string" || !/(?:Z|[+]00:00)$/.test(value)) {
          const error = new Error("A resposta não contém uma hora UTC válida.");
          error.code = "INVALID_UTC_DATETIME";
          throw error;
        }
        const externalMs = Date.parse(value);
        if (!Number.isFinite(externalMs)) {
          const error = new Error("A resposta não contém uma hora UTC válida.");
          error.code = "INVALID_UTC_DATETIME";
          throw error;
        }
        return externalMs;
      });
    }

    function finishRequest(request, error, externalMs) {
      if (activeRequest !== request) return;
      activeRequest = null;
      if (request.timeout !== null) cancel(request.timeout);
      if (disposed || request.superseded) return;

      if (error) {
        log("warn", "verification failed", {
          ...requestDetails(request),
          errorCode: error.code || "FETCH_OR_PARSE_ERROR",
          errorName: error.name || "Error",
          errorMessage: error.message || String(error)
        }, error);
        invalidateSample();
        emit("retrying", null, null);
        scheduleRetry();
        return;
      }

      if (externalMs >= RELEASE_AT_MS) {
        invalidateSample();
        clearSchedule();
        removeLifecycleListeners();
        log("info", "verification succeeded; release confirmed", requestDetails(request));
        emit("unlocked", 0, formatRemaining(0));
        if (!unlockedNotified) {
          unlockedNotified = true;
          if (typeof options.onUnlock === "function") options.onUnlock();
        }
        return;
      }

      sample = { externalMs, anchor: monotonicNow() };
      clearTimer("retry");
      emitCountdown();
      schedulePeriodicRefresh();
    }

    function requestVerification(reason = "unspecified") {
      if (disposed || state === "unlocked" || activeRequest) return;
      clearTimer("retry");
      clearTimer("countdown");
      emit("checking", remainingSeconds === 0 ? 0 : null, remainingSeconds === 0 ? formatRemaining(0) : null);
      const request = { timeout: null, superseded: false, controller: null, reason, startedAt: monotonicNow(), responseStatus: undefined };
      activeRequest = request;
      if (!fetchTime) {
        const error = new Error("O serviço de hora não está disponível.");
        error.code = "FETCH_UNAVAILABLE";
        finishRequest(request, error);
        return;
      }
      if (AbortControllerClass) request.controller = new AbortControllerClass();
      request.timeout = schedule(() => {
        request.timedOut = true;
        if (request.controller) request.controller.abort();
        const error = new Error("A verificação da hora excedeu o tempo limite.");
        error.code = "TIMEOUT";
        finishRequest(request, error);
      }, REQUEST_TIMEOUT_MS);

      let responsePromise;
      try {
        responsePromise = fetchTime(TIME_ENDPOINT, {
          method: "GET",
          credentials: "omit",
          cache: "no-store",
          ...(request.controller ? { signal: request.controller.signal } : {})
        });
      } catch (error) {
        const fetchError = error instanceof Error ? error : new Error(String(error));
        fetchError.code = fetchError.code || "FETCH_THROWN";
        finishRequest(request, fetchError);
        return;
      }
      log("debug", "verification started", requestDetails(request));
      Promise.resolve(responsePromise)
        .then((response) => {
          request.responseStatus = response && response.status;
          return parseExternalTime(response);
        })
        .then((externalMs) => finishRequest(request, null, externalMs), (error) => finishRequest(request, error));
    }

    function handleVisibilityChange() {
      if (isVisible()) {
        refresh("visibility");
      } else {
        clearTimer("countdown");
        clearTimer("periodic");
      }
    }

    function handlePageShow() {
      if (isVisible()) refresh("pageshow");
    }

    function addLifecycleListeners() {
      if (visibilityTarget && typeof visibilityTarget.addEventListener === "function") {
        visibilityTarget.addEventListener("visibilitychange", handleVisibilityChange);
      }
      if (pageTarget && typeof pageTarget.addEventListener === "function") {
        pageTarget.addEventListener("pageshow", handlePageShow);
      }
    }

    function removeLifecycleListeners() {
      if (visibilityTarget && typeof visibilityTarget.removeEventListener === "function") {
        visibilityTarget.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (pageTarget && typeof pageTarget.removeEventListener === "function") {
        pageTarget.removeEventListener("pageshow", handlePageShow);
      }
    }

    function start() {
      if (disposed || started) return;
      started = true;
      addLifecycleListeners();
      requestVerification("initial");
    }

    function refresh(reason = "manual") {
      if (disposed || state === "unlocked") return;
      if (!started) {
        start();
        return;
      }
      if (activeRequest) return;
      clearTimer("retry");
      requestVerification(reason);
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      clearSchedule();
      removeLifecycleListeners();
      if (activeRequest) {
        activeRequest.superseded = true;
        if (activeRequest.controller) activeRequest.controller.abort();
        if (activeRequest.timeout !== null) cancel(activeRequest.timeout);
        activeRequest = null;
      }
      listeners.clear();
    }

    return Object.freeze({
      start,
      refresh,
      dispose,
      subscribe(listener) {
        if (typeof listener !== "function") return () => {};
        listeners.add(listener);
        listener(Object.freeze({ state, remainingSeconds, formatted }));
        return () => listeners.delete(listener);
      },
      getState() {
        return Object.freeze({ state, remainingSeconds, formatted });
      }
    });
  }

  const api = Object.freeze({
    RELEASE_AT,
    RELEASE_AT_MS,
    TIME_ENDPOINT,
    REQUEST_TIMEOUT_MS,
    RETRY_DELAY_MS,
    REFRESH_INTERVAL_MS,
    formatRemaining,
    createTimegate,
    createController: createTimegate
  });

  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NameGameTimegate = api;
})(typeof window === "object" ? window : null);
