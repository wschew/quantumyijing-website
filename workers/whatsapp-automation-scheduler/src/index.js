const RESPONSE_LIMIT = 1000;

function required(value, name) {
  const cleaned = String(value || '').trim();

  if (!cleaned) {
    throw new Error(`${name} is not configured.`);
  }

  return cleaned;
}

async function runAction({
  baseUrl,
  adminToken,
  action
}) {
  const url =
    `${baseUrl}?action=${encodeURIComponent(action)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      accept: 'application/json',
      'user-agent':
        'QY-WhatsApp-Automation-Scheduler/1.0'
    }
  });

  const responseText = await response.text();
  let result = null;

  try {
    result = JSON.parse(responseText);
  } catch {
    // Leave result null for the validation below.
  }

  if (!response.ok) {
    throw new Error(
      `WhatsApp automation ${action} returned HTTP ` +
      `${response.status}: ` +
      responseText.slice(0, RESPONSE_LIMIT)
    );
  }

  if (!result || result.ok !== true) {
    throw new Error(
      `WhatsApp automation ${action} returned an invalid response: ` +
      responseText.slice(0, RESPONSE_LIMIT)
    );
  }

  return result;
}

export default {
  async scheduled(controller, env) {
    const baseUrl = required(
      env.AUTOMATION_BASE_URL,
      'AUTOMATION_BASE_URL'
    );

    const adminToken = required(
      env.ADMIN_TOKEN,
      'ADMIN_TOKEN'
    );

    const enrollment = await runAction({
      baseUrl,
      adminToken,
      action: 'enroll'
    });

    const delivery = await runAction({
      baseUrl,
      adminToken,
      action: 'run_due'
    });

    const summary = {
      scheduledTime:
        new Date(controller.scheduledTime).toISOString(),
      cron: controller.cron,
      enrollment: {
        checked: Number(enrollment.checked || 0),
        enrolled: Number(enrollment.enrolled || 0),
        existing: Number(enrollment.existing || 0),
        skipped: Number(enrollment.skipped || 0)
      },
      delivery: {
        checked: Number(delivery.checked || 0),
        sent: Number(delivery.sent || 0),
        failed: Number(delivery.failed || 0),
        skipped: Number(delivery.skipped || 0)
      }
    };

    console.log(
      'WhatsApp automation hourly run',
      summary
    );

    if (summary.delivery.failed > 0) {
      throw new Error(
        `WhatsApp automation run completed with ` +
        `${summary.delivery.failed} failed item(s).`
      );
    }
  }
};
