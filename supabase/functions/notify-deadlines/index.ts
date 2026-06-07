import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
);

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') ?? '';
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';

function toYYYYMMDD(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function sendNotification(externalUserId: string, title: string, body: string) {
  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: [externalUserId],
      headings: { ja: title, en: title },
      contents: { ja: body, en: body },
      url: 'https://mzgchiyofficesoci3015-cell.github.io/money-diagnosis/',
    }),
  });
  return res.ok;
}

serve(async () => {
  const today = new Date();
  const offsets = [
    { days: 30, label: '30日後' },
    { days: 7,  label: '1週間後' },
    { days: 1,  label: '明日' },
  ];

  for (const { days, label } of offsets) {
    const target = new Date(today);
    target.setDate(today.getDate() + days);
    const targetStr = toYYYYMMDD(target);

    const { data: rows, error } = await supabase
      .from('user_deadlines')
      .select('user_id, prog_name, deadline_date')
      .eq('deadline_date', targetStr);

    if (error || !rows) continue;

    for (const row of rows) {
      const title = `📋 申請期限のお知らせ`;
      const body = `「${row.prog_name}」の申請期限は${label}（${target.getMonth()+1}/${target.getDate()}）です。`;
      await sendNotification(row.user_id, title, body);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
