/* ==================================================
   AI Agent Chat Widget

   Calls the Lambda backend configured via window._config.aiChat.endpoint
   (see js/config.js). Until that endpoint is set, falls back to a local
   stub reply so the widget still works before the backend is deployed.
   ================================================== */
(function () {
    'use strict';

    var MAX_HISTORY_TURNS = 8;

    var STUB_REPLIES = [
        "Thanks for reaching out! This assistant isn't connected to a live " +
        "AI backend yet — check back soon.",
        "I can't answer that yet — my responses aren't wired up to Claude. " +
        "In the meantime, feel free to use the contact form below or email " +
        "sorin.alex.ilie@gmail.com directly.",
        "Good question! Once this chat is connected to an AI backend, I'll be " +
        "able to help with that. For now, check out the About and Portfolio " +
        "sections above."
    ];

    function createEl(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
    }

    function scrollToBottom(container) {
        container.scrollTop = container.scrollHeight;
    }

    function addMessage(container, text, role) {
        var msg = createEl('div', 'ai-chat-msg ai-chat-msg--' + role, text);
        container.appendChild(msg);
        scrollToBottom(container);
        return msg;
    }

    function showTyping(container) {
        var typing = createEl('div', 'ai-chat-msg ai-chat-msg--bot ai-chat-msg--typing');
        typing.appendChild(createEl('span'));
        typing.appendChild(createEl('span'));
        typing.appendChild(createEl('span'));
        container.appendChild(typing);
        scrollToBottom(container);
        return typing;
    }

    function hashCode(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    function getStubReply(userText) {
        var idx = Math.abs(hashCode(userText)) % STUB_REPLIES.length;
        return STUB_REPLIES[idx];
    }

    function getEndpoint() {
        return (window._config && window._config.aiChat && window._config.aiChat.endpoint) || '';
    }

    // Calls the Lambda backend if configured, otherwise resolves with a stub reply.
    function fetchReply(userText, history) {
        var endpoint = getEndpoint();

        if (!endpoint) {
            return new Promise(function (resolve) {
                setTimeout(function () {
                    resolve(getStubReply(userText));
                }, 700 + Math.random() * 500);
            });
        }

        return fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userText, history: history })
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Request failed with status ' + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                return data.reply || "Sorry, I didn't get a response — please try again.";
            })
            .catch(function (err) {
                console.error('AI chat request failed:', err);
                return "Sorry, I'm having trouble connecting right now. Please try again shortly, " +
                    "or reach out via the contact form below.";
            });
    }

    function init() {
        var toggle = document.getElementById('ai-chat-toggle');
        var panel = document.getElementById('ai-chat-panel');
        var closeBtn = document.getElementById('ai-chat-close');
        var form = document.getElementById('ai-chat-form');
        var input = document.getElementById('ai-chat-input');
        var messages = document.getElementById('ai-chat-messages');
        var sendBtn = document.getElementById('ai-chat-send');
        var history = [];

        if (!toggle || !panel || !form || !input || !messages) return;

        function openPanel() {
            panel.classList.add('is-open');
            panel.setAttribute('aria-hidden', 'false');
            input.focus();
        }

        function closePanel() {
            panel.classList.remove('is-open');
            panel.setAttribute('aria-hidden', 'true');
        }

        toggle.addEventListener('click', function () {
            if (panel.classList.contains('is-open')) {
                closePanel();
            } else {
                openPanel();
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', closePanel);
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var text = input.value.trim();
            if (!text) return;

            addMessage(messages, text, 'user');
            input.value = '';
            sendBtn.disabled = true;

            var typing = showTyping(messages);
            var historyForRequest = history.slice(-MAX_HISTORY_TURNS);

            fetchReply(text, historyForRequest).then(function (reply) {
                typing.remove();
                addMessage(messages, reply, 'bot');

                history.push({ role: 'user', content: text });
                history.push({ role: 'assistant', content: reply });
                history = history.slice(-MAX_HISTORY_TURNS);

                sendBtn.disabled = false;
                input.focus();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
