import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, webhookSecret);
  } catch (err) {
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'invoice.payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session | Stripe.Invoice;
    const customerEmail = 'customer_email' in session ? session.customer_email : null;

    if (!customerEmail) {
      return new Response('No customer email', { status: 200 });
    }

    // Set premium until end of subscription period
    let premiumUntil: string;
    if ('subscription' in session && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      premiumUntil = new Date(sub.current_period_end * 1000).toISOString();
    } else {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      premiumUntil = d.toISOString();
    }

    // Find user by email and update premium status
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email === customerEmail);
    if (user) {
      await supabase.from('profiles').upsert({
        user_id: user.id,
        is_premium: true,
        premium_until: premiumUntil,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    const email = customer.email;

    if (email) {
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users?.users?.find(u => u.email === email);
      if (user) {
        await supabase.from('profiles').update({
          is_premium: false,
          premium_until: null,
          updated_at: new Date().toISOString()
        }).eq('user_id', user.id);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
