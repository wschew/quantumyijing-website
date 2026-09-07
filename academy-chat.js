/**
 * Quantum YiJing Academy Assistant
 * Public Website Chat UI
 * v3.7.0
 */

(() => {
  const API_URL = "/api/ai/academy";

  function createElement(tag, className, text) {
    const el = document.createElement(tag);

    if (className) {
      el.className = className;
    }

    if (typeof text === "string") {
      el.textContent = text;
    }

    return el;
  }

  function addMessage(messagesEl, role, text) {
    const message = createElement(
      "div",
      `qy-chat-message ${
        role === "user"
          ? "qy-chat-message-user"
          : "qy-chat-message-ai"
      }`,
      text
    );

    messagesEl.appendChild(message);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function buildChat() {
    if (document.querySelector(".qy-chat-launcher")) {
      return;
    }

    const launcher = createElement(
      "button",
      "qy-chat-launcher",
      "AI"
    );

    launcher.type = "button";
    launcher.setAttribute(
      "aria-label",
      "Open Quantum YiJing Academy Assistant"
    );

    const panel = createElement(
      "section",
      "qy-chat-panel"
    );

    panel.setAttribute(
      "aria-label",
      "Quantum YiJing Academy Assistant"
    );

    const header = createElement(
      "div",
      "qy-chat-header"
    );

    const titleWrap = createElement(
      "div",
      "qy-chat-title-wrap"
    );

    const title = createElement(
      "h2",
      "qy-chat-title",
      "Academy Assistant"
    );

    const subtitle = createElement(
      "div",
      "qy-chat-subtitle",
      "Quantum YiJing International Academy"
    );

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeButton = createElement(
      "button",
      "qy-chat-close",
      "×"
    );

    closeButton.type = "button";
    closeButton.setAttribute(
      "aria-label",
      "Close Academy Assistant"
    );

    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    const messages = createElement(
      "div",
      "qy-chat-messages"
    );

    const conversationHistory = [];

    addMessage(
      messages,
      "assistant",
      "Hello! I’m the Quantum YiJing Academy Assistant.\nAsk me about courses, services, registration, Master Chew, or general Academy enquiries.\n\n您好！我是量子易经国际学院 AI 助手。\n您可以询问课程、服务、报名、赵辉顺导师或学院一般资讯。"
    );

    const status = createElement(
      "div",
      "qy-chat-status",
      ""
    );

    const form = createElement(
      "form",
      "qy-chat-form"
    );

    const input = createElement(
      "textarea",
      "qy-chat-input"
    );

    input.rows = 1;
    input.maxLength = 1200;
    input.placeholder = "Ask a question / 请输入您的问题";

    const sendButton = createElement(
      "button",
      "qy-chat-send",
      "Send"
    );

    sendButton.type = "submit";

    form.appendChild(input);
    form.appendChild(sendButton);

    const note = createElement(
      "div",
      "qy-chat-note",
      "AI responses are for general Academy information. Current prices, schedules, registration and payment status should be confirmed through the Academy."
    );

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(status);
    panel.appendChild(form);
    panel.appendChild(note);

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    function openChat() {
      panel.classList.add("qy-chat-open");
      launcher.setAttribute("aria-expanded", "true");

      setTimeout(() => {
        input.focus();
      }, 50);
    }

    function closeChat() {
      panel.classList.remove("qy-chat-open");
      launcher.setAttribute("aria-expanded", "false");
    }

    launcher.addEventListener("click", () => {
      if (panel.classList.contains("qy-chat-open")) {
        closeChat();
      } else {
        openChat();
      }
    });

    closeButton.addEventListener("click", closeChat);

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height =
        Math.min(input.scrollHeight, 110) + "px";
    });

    input.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const message = input.value.trim();

      if (!message) {
        return;
      }

      addMessage(messages, "user", message);

      conversationHistory.push({
        role: "user",
        content: message
      });

      input.value = "";
      input.style.height = "auto";

      input.disabled = true;
      sendButton.disabled = true;
      status.textContent = "Academy Assistant is thinking...";

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          },
          body: JSON.stringify({
            message,
            history: conversationHistory
              .slice(0, -1)
              .slice(-6)
          })
        });

        const data = await response.json();

        if (!response.ok || !data?.ok) {
          throw new Error(
            data?.error ||
              "The Academy Assistant could not respond."
          );
        }

        addMessage(
          messages,
          "assistant",
          data.reply
        );

        conversationHistory.push({
          role: "assistant",
          content: data.reply
        });

        if (conversationHistory.length > 8) {
          conversationHistory.splice(
            0,
            conversationHistory.length - 8
          );
        }

        status.textContent = "";
      } catch (error) {
        console.error(
          "Academy chat request failed:",
          error
        );

        addMessage(
          messages,
          "assistant",
          "Sorry, the Academy Assistant is temporarily unavailable. Please try again."
        );

        status.textContent = "";
      } finally {
        input.disabled = false;
        sendButton.disabled = false;
        input.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      buildChat
    );
  } else {
    buildChat();
  }
})();
