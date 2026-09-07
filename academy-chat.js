/**
 * Quantum YiJing Academy Assistant
 * Public Website Chat UI + CRM enquiry handoff
 * v3.7.1
 */

(() => {
  const API_URL = "/api/ai/academy";
  const ENQUIRY_URL = "/api/enquiry";

  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === "string") el.textContent = text;
    return el;
  }

  function addMessage(messagesEl, role, text) {
    const message = createElement(
      "div",
      `qy-chat-message ${role === "user" ? "qy-chat-message-user" : "qy-chat-message-ai"}`,
      text
    );

    messagesEl.appendChild(message);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return message;
  }

  function pageLanguage() {
    const lang = String(document.documentElement.lang || "").toLowerCase();
    return lang.startsWith("zh") ? "zh" : "en";
  }

  function inferInterest(history) {
    const text = history
      .slice(-6)
      .map((item) => item.content || "")
      .join(" ")
      .toLowerCase();

    if (/bazi|八字/.test(text)) return "Bazi Consultation";
    if (/feng\s*shui|风水|風水/.test(text)) return "Feng Shui Consultation";
    if (/baby\s*nam|name\s*(a|the)?\s*baby|宝宝取名|寶寶取名|婴儿取名|嬰兒取名/.test(text)) return "Baby Naming";
    if (/research|collaboration|quantum|研究|合作/.test(text)) return "Research Collaboration";
    if (/media|speaking|speaker|talk|seminar|讲座|講座|演讲|演講|媒体|媒體/.test(text)) return "Media / Speaking";
    if (/course|class|learn|study|课程|課程|学习|學習|报名|報名/.test(text)) return "Academy Course";
    return "General Enquiry";
  }

  function buildChat() {
    if (document.querySelector(".qy-chat-launcher")) return;

    const conversationHistory = [];
    let latestUserQuestion = "";
    let enquiryStartedAt = 0;

    const launcher = createElement("button", "qy-chat-launcher", "AI");
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open Quantum YiJing Academy Assistant");
    launcher.setAttribute("aria-expanded", "false");

    const panel = createElement("section", "qy-chat-panel");
    panel.setAttribute("aria-label", "Quantum YiJing Academy Assistant");

    const header = createElement("div", "qy-chat-header");
    const titleWrap = createElement("div", "qy-chat-title-wrap");
    const title = createElement("h2", "qy-chat-title", "Academy Assistant");
    const subtitle = createElement("div", "qy-chat-subtitle", "Quantum YiJing International Academy");
    const closeButton = createElement("button", "qy-chat-close", "×");

    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close Academy Assistant");

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    const messages = createElement("div", "qy-chat-messages");

    addMessage(
      messages,
      "assistant",
      "Hello! I’m the Quantum YiJing Academy Assistant.\nAsk me about courses, services, registration, Master Chew, or general Academy enquiries.\n\n您好！我是量子易经国际学院 AI 助手。\n您可以询问课程、服务、报名、赵辉顺导师或学院一般资讯。"
    );

    const status = createElement("div", "qy-chat-status", "");

    const form = createElement("form", "qy-chat-form");
    const input = createElement("textarea", "qy-chat-input");
    input.rows = 1;
    input.maxLength = 1200;
    input.placeholder = "Ask a question / 请输入您的问题";

    const sendButton = createElement("button", "qy-chat-send", "Send");
    sendButton.type = "submit";
    form.appendChild(input);
    form.appendChild(sendButton);

    const actionBar = createElement("div", "qy-chat-actions");
    const enquireButton = createElement("button", "qy-chat-enquire-button", "Enquire Now / 立即咨询");
    enquireButton.type = "button";
    actionBar.appendChild(enquireButton);

    const enquiryWrap = createElement("div", "qy-chat-enquiry-wrap");
    enquiryWrap.hidden = true;

    const note = createElement(
      "div",
      "qy-chat-note",
      "AI responses are for general Academy information. Current prices, schedules, registration and payment status should be confirmed through the Academy."
    );

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(status);
    panel.appendChild(form);
    panel.appendChild(actionBar);
    panel.appendChild(enquiryWrap);
    panel.appendChild(note);

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    function openChat() {
      panel.classList.add("qy-chat-open");
      launcher.setAttribute("aria-expanded", "true");
      setTimeout(() => input.focus(), 50);
    }

    function closeChat() {
      panel.classList.remove("qy-chat-open");
      launcher.setAttribute("aria-expanded", "false");
    }

    function closeEnquiryForm() {
      enquiryWrap.hidden = true;
      enquiryWrap.innerHTML = "";
      form.hidden = false;
      actionBar.hidden = false;
      note.hidden = false;
      messages.scrollTop = messages.scrollHeight;
    }

    function openEnquiryForm() {
      enquiryStartedAt = Date.now();
      enquiryWrap.innerHTML = "";
      enquiryWrap.hidden = false;
      form.hidden = true;
      actionBar.hidden = true;
      note.hidden = true;

      const lang = pageLanguage();
      const enquiryForm = createElement("form", "qy-enquiry-form");
      const heading = createElement(
        "div",
        "qy-enquiry-heading",
        lang === "zh" ? "发送咨询给学院" : "Send an enquiry to the Academy"
      );
      const helper = createElement(
        "div",
        "qy-enquiry-helper",
        lang === "zh"
          ? "请填写以下资料。提交前您可以查看并修改您的问题。"
          : "Complete the details below. You can review and edit your question before submitting."
      );

      function field(labelText, name, type = "text", required = false) {
        const label = createElement("label", "qy-enquiry-field");
        const caption = createElement("span", "qy-enquiry-label", labelText);
        const control = document.createElement("input");
        control.className = "qy-enquiry-input";
        control.name = name;
        control.type = type;
        control.autocomplete = name === "name" ? "name" : name === "email" ? "email" : name === "phone" ? "tel" : "off";
        if (required) control.required = true;
        label.appendChild(caption);
        label.appendChild(control);
        return { label, control };
      }

      const nameField = field(lang === "zh" ? "姓名 *" : "Name *", "name", "text", true);
      const emailField = field(lang === "zh" ? "电邮 *" : "Email *", "email", "email", true);
      const phoneField = field(lang === "zh" ? "WhatsApp / 电话" : "WhatsApp / Phone", "phone", "tel", false);
      const countryField = field(lang === "zh" ? "国家 / 地区" : "Country", "country", "text", false);

      const interestLabel = createElement("label", "qy-enquiry-field");
      const interestCaption = createElement("span", "qy-enquiry-label", lang === "zh" ? "咨询类别 *" : "Area of interest *");
      const interestSelect = document.createElement("select");
      interestSelect.className = "qy-enquiry-input qy-enquiry-select";
      interestSelect.name = "interest";
      interestSelect.required = true;

      const interests = [
        "General Enquiry",
        "Academy Course",
        "Bazi Consultation",
        "Feng Shui Consultation",
        "Baby Naming",
        "Research Collaboration",
        "Media / Speaking",
        "Other"
      ];

      const zhInterest = {
        "General Enquiry": "一般咨询",
        "Academy Course": "学院课程",
        "Bazi Consultation": "八字咨询",
        "Feng Shui Consultation": "风水咨询",
        "Baby Naming": "宝宝取名",
        "Research Collaboration": "研究合作",
        "Media / Speaking": "媒体 / 演讲",
        "Other": "其他"
      };

      const inferredInterest = inferInterest(conversationHistory);
      interests.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = lang === "zh" ? zhInterest[value] : value;
        if (value === inferredInterest) option.selected = true;
        interestSelect.appendChild(option);
      });
      interestLabel.appendChild(interestCaption);
      interestLabel.appendChild(interestSelect);

      const messageLabel = createElement("label", "qy-enquiry-field");
      const messageCaption = createElement("span", "qy-enquiry-label", lang === "zh" ? "您的问题 / 留言 *" : "Your question / message *");
      const messageInput = document.createElement("textarea");
      messageInput.className = "qy-enquiry-input qy-enquiry-message";
      messageInput.name = "message";
      messageInput.rows = 4;
      messageInput.maxLength = 3000;
      messageInput.required = true;
      messageInput.value = latestUserQuestion || (lang === "zh" ? "我想进一步了解学院的课程或服务。" : "I would like more information about the Academy's courses or services.");
      messageLabel.appendChild(messageCaption);
      messageLabel.appendChild(messageInput);

      const honeypot = document.createElement("input");
      honeypot.type = "text";
      honeypot.name = "website";
      honeypot.tabIndex = -1;
      honeypot.autocomplete = "off";
      honeypot.className = "qy-enquiry-honeypot";
      honeypot.setAttribute("aria-hidden", "true");

      const consentLabel = createElement("label", "qy-enquiry-consent");
      const consent = document.createElement("input");
      consent.type = "checkbox";
      consent.name = "consent";
      consent.value = "on";
      consent.required = true;
      const consentText = createElement(
        "span",
        "",
        lang === "zh"
          ? "我同意量子易经国际学院使用以上资料回复我的咨询。"
          : "I consent to Quantum YiJing International Academy using these details to respond to my enquiry."
      );
      consentLabel.appendChild(consent);
      consentLabel.appendChild(consentText);

      const enquiryStatus = createElement("div", "qy-enquiry-status", "");
      const buttons = createElement("div", "qy-enquiry-buttons");
      const cancel = createElement("button", "qy-enquiry-cancel", lang === "zh" ? "返回聊天" : "Back to chat");
      cancel.type = "button";
      const submit = createElement("button", "qy-enquiry-submit", lang === "zh" ? "发送咨询" : "Send Enquiry");
      submit.type = "submit";
      buttons.appendChild(cancel);
      buttons.appendChild(submit);

      enquiryForm.appendChild(heading);
      enquiryForm.appendChild(helper);
      enquiryForm.appendChild(nameField.label);
      enquiryForm.appendChild(emailField.label);
      enquiryForm.appendChild(phoneField.label);
      enquiryForm.appendChild(countryField.label);
      enquiryForm.appendChild(interestLabel);
      enquiryForm.appendChild(messageLabel);
      enquiryForm.appendChild(honeypot);
      enquiryForm.appendChild(consentLabel);
      enquiryForm.appendChild(enquiryStatus);
      enquiryForm.appendChild(buttons);
      enquiryWrap.appendChild(enquiryForm);

      cancel.addEventListener("click", closeEnquiryForm);

      enquiryForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        submit.disabled = true;
        cancel.disabled = true;
        enquiryStatus.className = "qy-enquiry-status";
        enquiryStatus.textContent = lang === "zh" ? "正在发送咨询…" : "Submitting your enquiry…";

        try {
          const elapsed = Date.now() - enquiryStartedAt;
          if (elapsed < 2600) {
            await new Promise((resolve) => setTimeout(resolve, 2600 - elapsed));
          }

          const query = new URLSearchParams(location.search);
          const body = {
            name: nameField.control.value.trim(),
            email: emailField.control.value.trim(),
            phone: phoneField.control.value.trim(),
            country: countryField.control.value.trim(),
            interest: interestSelect.value,
            message: messageInput.value.trim(),
            consent: consent.checked ? "on" : "",
            website: honeypot.value,
            startedAt: enquiryStartedAt,
            language: lang,
            marketingSource: "AI Assistant",
            campaignCode: query.get("utm_campaign") || query.get("campaign") || "",
            landingPage: location.pathname,
            referrer: document.referrer,
            utmSource: query.get("utm_source") || "qy-ai",
            utmMedium: query.get("utm_medium") || "chatbot",
            utmCampaign: query.get("utm_campaign") || "",
            utmContent: query.get("utm_content") || "",
            utmTerm: query.get("utm_term") || "",
            affiliateCode: query.get("aff") || query.get("affiliate") || "",
            createOrder: false
          };

          const response = await fetch(ENQUIRY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });

          const raw = await response.text();
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = { error: raw };
          }

          if (!response.ok || !data.reference) {
            throw new Error(
              data.error ||
                (lang === "zh" ? "咨询未被系统记录，请重试。" : "The enquiry was not recorded. Please try again.")
            );
          }

          enquiryWrap.innerHTML = "";
          const success = createElement("div", "qy-enquiry-success");
          const successTitle = createElement("div", "qy-enquiry-success-title", lang === "zh" ? "✓ 咨询已成功发送" : "✓ Enquiry received");
          const successText = createElement(
            "div",
            "qy-enquiry-success-text",
            lang === "zh"
              ? `谢谢您。您的咨询已记录。参考编号：${data.reference}。学院一般会在 1–2 个工作日内回复。`
              : `Thank you. Your enquiry has been recorded. Reference: ${data.reference}. The Academy normally replies within 1–2 working days.`
          );
          const returnButton = createElement("button", "qy-enquiry-submit qy-enquiry-return", lang === "zh" ? "返回聊天" : "Return to chat");
          returnButton.type = "button";
          success.appendChild(successTitle);
          success.appendChild(successText);
          success.appendChild(returnButton);
          enquiryWrap.appendChild(success);

          returnButton.addEventListener("click", closeEnquiryForm);
        } catch (error) {
          console.error("Academy enquiry submission failed:", error);
          enquiryStatus.className = "qy-enquiry-status qy-enquiry-error";
          enquiryStatus.textContent = error.message || (lang === "zh" ? "发送失败，请重试。" : "Unable to submit. Please try again.");
          submit.disabled = false;
          cancel.disabled = false;
        }
      });

      setTimeout(() => nameField.control.focus(), 50);
    }

    launcher.addEventListener("click", () => {
      if (panel.classList.contains("qy-chat-open")) closeChat();
      else openChat();
    });

    closeButton.addEventListener("click", closeChat);
    enquireButton.addEventListener("click", openEnquiryForm);

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 110) + "px";
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const message = input.value.trim();
      if (!message) return;

      latestUserQuestion = message;
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
            history: conversationHistory.slice(0, -1).slice(-6)
          })
        });

        const data = await response.json();

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "The Academy Assistant could not respond.");
        }

        addMessage(messages, "assistant", data.reply);

        conversationHistory.push({
          role: "assistant",
          content: data.reply
        });

        if (conversationHistory.length > 8) {
          conversationHistory.splice(0, conversationHistory.length - 8);
        }

        status.textContent = "";
      } catch (error) {
        console.error("Academy chat request failed:", error);
        addMessage(messages, "assistant", "Sorry, the Academy Assistant is temporarily unavailable. Please try again.");
        status.textContent = "";
      } finally {
        input.disabled = false;
        sendButton.disabled = false;
        input.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildChat);
  } else {
    buildChat();
  }
})();
