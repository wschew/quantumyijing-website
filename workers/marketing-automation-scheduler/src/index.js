const RESPONSE_LIMIT = 1000;

function required(value, name) {
  const cleaned = String(value || '').trim();
  if (!cleaned) throw new Error(`${name} is not configured.`);
  return cleaned;
}

export default {
  async scheduled(controller, env) {
    const runUrl = required(env.AUTOMATION_RUN_URL, 'AUTOMATION_RUN_URL');
    const adminToken = required(env.ADMIN_TOKEN, 'ADMIN_TOKEN');

    const response = await fetch(runUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        accept: 'application/json',
        'user-agent': 'QY-Marketing-Automation-Scheduler/1.0'
      }
    });

    const responseText = await response.text();
    let result = null;

    try {
      result = JSON.parse(responseText);
    } catch {
      // Keep result null so the diagnostic below reports an invalid response.
    }

    if (!response.ok) {
      throw new Error(
        `Automation runner returned HTTP ${response.status}: ` +
        responseText.slice(0, RESPONSE_LIMIT)
      );
    }

    if (!result || result.ok !== true) {
      throw new Error(
        'Automation runner returned an invalid response: ' +
        responseText.slice(0, RESPONSE_LIMIT)
      );
    }

    const summary = {
      scheduledTime: new Date(controller.scheduledTime).toISOString(),
      cron: controller.cron,
      checked: Number(result.checked || 0),
      sent: Number(result.sent || 0),
      stopped: Number(result.stopped || 0),
      failed: Number(result.failed || 0)
    };

    console.log('Marketing automation hourly run', summary);

    if (summary.failed > 0) {
      throw new Error(
        `Marketing automation run completed with ${summary.failed} failed item(s).`
      );
    }
  }
};
