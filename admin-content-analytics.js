(() => {
  "use strict";

  const TOKEN_KEY =
    "qy_f6_content_analytics_admin_token";

  const $ =
    selector => document.querySelector(selector);

  const authPanel =
    $("#authPanel");

  const dashboard =
    $("#dashboard");

  const tokenInput =
    $("#adminToken");

  const status =
    $("#status");


  function token() {
    return (
      sessionStorage.getItem(TOKEN_KEY) || ""
    ).trim();
  }


  function setToken(value) {
    const clean =
      String(value || "").trim();

    if (clean) {
      sessionStorage.setItem(
        TOKEN_KEY,
        clean
      );
    }
    else {
      sessionStorage.removeItem(
        TOKEN_KEY
      );
    }
  }


  function setStatus(message, kind = "") {
    status.textContent =
      String(message || "");

    status.className =
      `status ${kind}`.trim();
  }


  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(
        element.firstChild
      );
    }
  }


  function textCell(value) {
    const td =
      document.createElement("td");

    td.textContent =
      String(value ?? "");

    return td;
  }


  function createBadge(value) {
    const span =
      document.createElement("span");

    span.className =
      "analytics-badge";

    span.textContent =
      String(value ?? "");

    return span;
  }


  function formatDate(value) {
    if (!value) return "";

    const date =
      new Date(
        String(value).includes("T")
          ? value
          : `${value.replace(" ", "T")}Z`
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return new Intl.DateTimeFormat(
      "en-MY",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kuala_Lumpur"
      }
    ).format(date);
  }


  function renderCards(summary, days) {

    const container =
      $("#summaryCards");

    clearElement(container);

    const cards = [
      ["Total drafts", summary.total_drafts],
      ["Draft", summary.draft_count],
      ["Approved", summary.approved_count],
      ["Archived", summary.archived_count],
      [`Created · ${days}d`, summary.created_in_window],
      [`Approved · ${days}d`, summary.approved_in_window],
      ["Total events", summary.total_events],
      [`Events · ${days}d`, summary.events_in_window]
    ];

    for (
      const [label, value]
      of cards
    ) {

      const card =
        document.createElement("div");

      card.className =
        "analytics-card";

      const small =
        document.createElement("div");

      small.className =
        "analytics-small";

      small.textContent =
        label;

      const strong =
        document.createElement("strong");

      strong.textContent =
        String(value ?? 0);

      card.append(
        small,
        strong
      );

      container.appendChild(
        card
      );
    }
  }


  function renderBreakdown(
    selector,
    rows,
    labelField
  ) {

    const container =
      $(selector);

    clearElement(container);

    if (!rows.length) {
      container.textContent =
        "No data yet.";
      return;
    }

    const table =
      document.createElement("table");

    const tbody =
      document.createElement("tbody");

    for (const row of rows) {

      const tr =
        document.createElement("tr");

      tr.append(
        textCell(
          row[labelField] ||
          "unspecified"
        ),
        textCell(
          row.total || 0
        )
      );

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    container.appendChild(table);
  }


  function renderDrafts(rows) {

    const tbody =
      $("#draftRows");

    clearElement(tbody);

    if (!rows.length) {
      const tr =
        document.createElement("tr");

      const td =
        document.createElement("td");

      td.colSpan = 8;
      td.textContent =
        "No AI content drafts yet.";

      tr.appendChild(td);
      tbody.appendChild(tr);

      return;
    }

    for (const row of rows) {

      const tr =
        document.createElement("tr");

      const statusCell =
        document.createElement("td");

      statusCell.appendChild(
        createBadge(row.status)
      );

      tr.append(
        textCell(row.id),
        textCell(row.title),
        textCell(row.content_type),
        textCell(row.language),
        statusCell,
        textCell(row.platform),
        textCell(row.model),
        textCell(
          formatDate(row.updated_at)
        )
      );

      tbody.appendChild(tr);
    }
  }


  function renderEvents(rows) {

    const tbody =
      $("#eventRows");

    clearElement(tbody);

    if (!rows.length) {
      const tr =
        document.createElement("tr");

      const td =
        document.createElement("td");

      td.colSpan = 6;
      td.textContent =
        "No lifecycle events yet.";

      tr.appendChild(td);
      tbody.appendChild(tr);

      return;
    }

    for (const row of rows) {

      const tr =
        document.createElement("tr");

      const eventCell =
        document.createElement("td");

      eventCell.appendChild(
        createBadge(row.event_type)
      );

      tr.append(
        eventCell,
        textCell(
          row.draft_title ||
          `Draft #${row.content_draft_id}`
        ),
        textCell(row.content_type),
        textCell(row.draft_status),
        textCell(row.notes),
        textCell(
          formatDate(row.event_at)
        )
      );

      tbody.appendChild(tr);
    }
  }


  async function loadAnalytics() {

    const currentToken =
      token();

    if (!currentToken) {

      authPanel.classList.remove(
        "hidden"
      );

      dashboard.classList.add(
        "hidden"
      );

      return;
    }

    const days =
      $("#days").value;

    const limit =
      $("#limit").value;

    setStatus(
      "Loading analytics…"
    );

    try {

      const response =
        await fetch(
          `/api/admin/content-analytics?days=${encodeURIComponent(days)}&limit=${encodeURIComponent(limit)}`,
          {
            headers: {
              authorization:
                `Bearer ${currentToken}`,
              accept:
                "application/json"
            },
            cache:
              "no-store"
          }
        );

      const data =
        await response.json()
          .catch(() => ({}));

      if (response.status === 401) {

        setToken("");

        authPanel.classList.remove(
          "hidden"
        );

        dashboard.classList.add(
          "hidden"
        );

        tokenInput.focus();

        throw new Error(
          "Admin authentication failed."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Analytics request failed."
        );
      }

      authPanel.classList.add(
        "hidden"
      );

      dashboard.classList.remove(
        "hidden"
      );

      renderCards(
        data.summary || {},
        data.window?.days || days
      );

      renderBreakdown(
        "#statusBreakdown",
        data.breakdowns?.status || [],
        "analytics-status"
      );

      renderBreakdown(
        "#typeBreakdown",
        data.breakdowns?.content_type || [],
        "content_type"
      );

      renderBreakdown(
        "#platformBreakdown",
        data.breakdowns?.platform || [],
        "platform"
      );

      renderBreakdown(
        "#modelBreakdown",
        data.breakdowns?.model || [],
        "model"
      );

      renderBreakdown(
        "#eventBreakdown",
        data.breakdowns?.event_type || [],
        "event_type"
      );

      renderDrafts(
        data.recent_drafts || []
      );

      renderEvents(
        data.recent_events || []
      );

      setStatus(
        `Loaded successfully · ${formatDate(data.generated_at)}`,
        "success"
      );

    }
    catch (error) {

      if (!dashboard.classList.contains("hidden")) {
        setStatus(
          error.message ||
          "Unable to load analytics.",
          "error"
        );
      }

      console.error(
        "Content analytics load failed",
        error
      );
    }
  }


  $("#connectBtn")
    .addEventListener(
      "click",
      () => {

        const supplied =
          tokenInput.value.trim();

        if (!supplied) {
          tokenInput.focus();
          return;
        }

        setToken(supplied);
        tokenInput.value = "";

        dashboard.classList.remove(
          "hidden"
        );

        loadAnalytics();
      }
    );


  $("#refreshBtn")
    .addEventListener(
      "click",
      loadAnalytics
    );


  $("#days")
    .addEventListener(
      "change",
      loadAnalytics
    );


  $("#limit")
    .addEventListener(
      "change",
      loadAnalytics
    );


  $("#disconnectBtn")
    .addEventListener(
      "click",
      () => {

        setToken("");

        dashboard.classList.add(
          "hidden"
        );

        authPanel.classList.remove(
          "hidden"
        );

        tokenInput.value = "";
        tokenInput.focus();
      }
    );


  if (token()) {

    dashboard.classList.remove(
      "hidden"
    );

    loadAnalytics();
  }

})();