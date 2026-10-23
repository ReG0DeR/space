/*
 * Cosmo Ops — core utilities and UI kit (toast, modal, reveal).
 * Loaded first (classic script, defer). Everything lives on window.CosmoOps.
 *
 *   const { $, $$, el, storage } = window.CosmoOps.utils;
 *   CosmoOps.toast("Готово", { type: "success" });
 *   CosmoOps.modal.open({ title: "Досьє", content: node });
 */
(function () {
    "use strict";

    const CosmoOps = (window.CosmoOps = window.CosmoOps || {});

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const debounce = (fn, ms = 150) => {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    };

    const throttle = (fn, ms = 100) => {
        let last = 0;
        let t;
        return (...args) => {
            const now = Date.now();
            const wait = ms - (now - last);
            clearTimeout(t);
            if (wait <= 0) {
                last = now;
                fn(...args);
            } else {
                t = setTimeout(() => {
                    last = Date.now();
                    fn(...args);
                }, wait);
            }
        };
    };

    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    const rand = (min, max) => min + Math.random() * (max - min);
    const randInt = (min, max) => Math.floor(rand(min, max + 1));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const shuffle = (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };

    const reducedMotionQuery = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const prefersReducedMotion = () => !!(reducedMotionQuery && reducedMotionQuery.matches);

    const numberFormat = new Intl.NumberFormat("uk-UA");
    const formatNumber = (n, opts) =>
        opts ? new Intl.NumberFormat("uk-UA", opts).format(n) : numberFormat.format(n);

    // pluralUk(5, ["ціль", "цілі", "цілей"]) → "цілей"
    const pluralUk = (n, forms) => {
        const abs = Math.abs(Math.trunc(n));
        const mod10 = abs % 10;
        const mod100 = abs % 100;
        if (mod10 === 1 && mod100 !== 11) return forms[0];
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
        return forms[2];
    };

    const escapeHTML = (str) =>
        String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

    // Safe localStorage wrapper (private mode / blocked storage never throws).
    const STORAGE_PREFIX = "cosmoops:";
    const storage = {
        get(key, fallback = null) {
            try {
                const raw = localStorage.getItem(STORAGE_PREFIX + key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch (e) {
                return fallback;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
                return true;
            } catch (e) {
                return false;
            }
        },
        remove(key) {
            try {
                localStorage.removeItem(STORAGE_PREFIX + key);
            } catch (e) {
                /* ignore */
            }
        },
    };

    /*
     * Tiny DOM builder. Text is always set via textContent (XSS-safe).
     *   el("button", { class: "btn btn--primary", type: "button", onClick: fn, dataset: { id: 1 } }, "Вогонь")
     * attrs: class, text, html (trusted strings only!), dataset, style (object), on<Event>, any other attribute.
     * children: Node | string | number | array of those (null/false are skipped).
     */
    const el = (tag, attrs = {}, children = []) => {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs || {})) {
            if (value === null || value === undefined || value === false) continue;
            if (key === "class" || key === "className") node.className = value;
            else if (key === "text") node.textContent = value;
            else if (key === "html") node.innerHTML = value;
            else if (key === "dataset") Object.assign(node.dataset, value);
            else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
            else if (key.startsWith("on") && typeof value === "function")
                node.addEventListener(key.slice(2).toLowerCase(), value);
            else if (value === true) node.setAttribute(key, "");
            else node.setAttribute(key, value);
        }
        const append = (child) => {
            if (child === null || child === undefined || child === false) return;
            if (Array.isArray(child)) child.forEach(append);
            else node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
        };
        append(children);
        return node;
    };

    // Run cb once when el scrolls into view (falls back to immediate call).
    const onVisible = (target, cb, { threshold = 0.2, rootMargin = "0px 0px -10% 0px", once = true } = {}) => {
        if (!target) return () => {};
        if (!("IntersectionObserver" in window)) {
            cb(target);
            return () => {};
        }
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    cb(entry.target);
                    if (once) io.unobserve(entry.target);
                });
            },
            { threshold, rootMargin },
        );
        io.observe(target);
        return () => io.disconnect();
    };

    // Event bus on document: emit("fire", {...}) → "cosmo:fire".
    const emit = (name, detail) => document.dispatchEvent(new CustomEvent("cosmo:" + name, { detail }));
    const on = (name, handler) => {
        const wrapped = (e) => handler(e.detail, e);
        document.addEventListener("cosmo:" + name, wrapped);
        return () => document.removeEventListener("cosmo:" + name, wrapped);
    };

    // Screen-reader announcements.
    let liveRegion;
    const announce = (message) => {
        if (!liveRegion) {
            liveRegion = el("div", { class: "visually-hidden", "aria-live": "polite", "aria-atomic": "true" });
            document.body.appendChild(liveRegion);
        }
        liveRegion.textContent = "";
        setTimeout(() => (liveRegion.textContent = message), 50);
    };

    /* ---------- Reveal on scroll: [data-reveal] → .is-visible ---------- */
    let revealObserver;
    const reveal = (scope = document) => {
        const items = $$("[data-reveal]:not(.is-visible)", scope);
        if (!items.length) return;
        if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
            items.forEach((item) => item.classList.add("is-visible"));
            return;
        }
        if (!revealObserver) {
            revealObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (!entry.isIntersecting) return;
                        entry.target.classList.add("is-visible");
                        revealObserver.unobserve(entry.target);
                    });
                },
                { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
            );
        }
        items.forEach((item) => revealObserver.observe(item));
    };

    /* ---------- Toasts ---------- */
    const TOAST_ICONS = { info: "ℹ", success: "✓", warning: "!", danger: "✕" };
    const toast = (message, { type = "info", duration = 4000 } = {}) => {
        let region = document.getElementById("toast-region");
        if (!region) {
            region = el("div", { id: "toast-region", class: "toast-region", "aria-live": "polite" });
            document.body.appendChild(region);
        }
        const item = el("div", { class: `toast toast--${type}`, role: type === "danger" ? "alert" : "status" }, [
            el("span", { class: "toast__icon", "aria-hidden": "true", text: TOAST_ICONS[type] || TOAST_ICONS.info }),
            el("p", { class: "toast__text", text: message }),
            el("button", {
                class: "toast__close",
                type: "button",
                "aria-label": "Закрити сповіщення",
                text: "×",
                onClick: () => dismiss(),
            }),
        ]);
        let timer;
        const dismiss = () => {
            clearTimeout(timer);
            if (!item.isConnected) return;
            item.classList.add("is-leaving");
            setTimeout(() => item.remove(), prefersReducedMotion() ? 0 : 250);
        };
        region.appendChild(item);
        requestAnimationFrame(() => item.classList.add("is-shown"));
        if (duration > 0) timer = setTimeout(dismiss, duration);
        return dismiss;
    };

    /* ---------- Modal (native <dialog>) ----------
     * CosmoOps.modal.open({
     *   title: "Заголовок",
     *   content: Node | string,          // string is rendered as text
     *   size: "md" | "lg",
     *   actions: [{ label, variant: "primary"|"secondary"|"danger"|"ghost", onClick(close), autofocus }],
     *   onClose() {}
     * }) → close()
     */
    let activeModal = null;
    const modal = {
        open({ title = "", content = "", size = "md", actions = [], onClose } = {}) {
            if (activeModal) activeModal.close();
            const previouslyFocused = document.activeElement;
            const titleId = "modal-title-" + Math.random().toString(36).slice(2, 8);
            const body = el("div", { class: "modal__body" }, typeof content === "string" ? el("p", { text: content }) : content);
            const footer = actions.length
                ? el(
                      "div",
                      { class: "modal__footer" },
                      actions.map((a) =>
                          el("button", {
                              type: "button",
                              class: `btn btn--${a.variant || "secondary"}`,
                              text: a.label,
                              autofocus: !!a.autofocus,
                              onClick: () => (a.onClick ? a.onClick(close) : close()),
                          }),
                      ),
                  )
                : null;
            const dialog = el("dialog", { class: `modal modal--${size}`, "aria-labelledby": titleId }, [
                el("div", { class: "modal__dialog" }, [
                    el("header", { class: "modal__header" }, [
                        el("h2", { class: "modal__title", id: titleId, text: title }),
                        el("button", {
                            type: "button",
                            class: "modal__close",
                            "aria-label": "Закрити",
                            text: "×",
                            onClick: () => close(),
                        }),
                    ]),
                    body,
                    footer,
                ]),
            ]);
            let closed = false;
            function close() {
                if (closed) return;
                closed = true;
                if (dialog.open) dialog.close();
            }
            dialog.addEventListener("close", () => {
                closed = true;
                document.documentElement.classList.remove("has-modal");
                dialog.remove();
                if (activeModal && activeModal.dialog === dialog) activeModal = null;
                if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
                if (onClose) onClose();
            });
            // Click on the backdrop (the dialog element itself, outside .modal__dialog) closes it.
            dialog.addEventListener("click", (e) => {
                if (e.target === dialog) close();
            });
            document.body.appendChild(dialog);
            document.documentElement.classList.add("has-modal");
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
            activeModal = { dialog, close };
            return close;
        },
        close() {
            if (activeModal) activeModal.close();
        },
        isOpen: () => !!activeModal,
    };

    CosmoOps.utils = {
        $,
        $$,
        debounce,
        throttle,
        clamp,
        rand,
        randInt,
        pick,
        shuffle,
        prefersReducedMotion,
        formatNumber,
        pluralUk,
        escapeHTML,
        storage,
        el,
        onVisible,
        emit,
        on,
        announce,
        reveal,
    };
    CosmoOps.toast = toast;
    CosmoOps.modal = modal;

    // Reveal static [data-reveal] blocks once the DOM is parsed (scripts are deferred).
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => reveal());
    else reveal();
})();
