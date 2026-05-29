import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendGift, subscribeToStreamer, payStreamerFee, toLocal } from './payments.js'

// vi.mock factories are hoisted to the top of the file before any variable declarations,
// so shared mock refs must also be hoisted via vi.hoisted().

// ── Stripe mock ────────────────────────────────────────────────
const { mockPaymentElement, mockElements, mockStripe } = vi.hoisted(() => {
  const mockPaymentElement = { mount: vi.fn(), destroy: vi.fn() }
  const mockElements       = { create: vi.fn(() => mockPaymentElement) }
  const mockStripe = {
    elements:       vi.fn(() => mockElements),
    confirmPayment: vi.fn(),
  }
  return { mockPaymentElement, mockElements, mockStripe }
})
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve(mockStripe)),
}))

// ── Supabase mock ──────────────────────────────────────────────
const { mockFunctionsInvoke, mockFrom } = vi.hoisted(() => ({
  mockFunctionsInvoke: vi.fn(),
  mockFrom: vi.fn(),
}))
vi.mock('./supabase.js', () => ({
  supabase: {
    functions: { invoke: mockFunctionsInvoke },
    from: mockFrom,
  },
}))

// ── Helpers ────────────────────────────────────────────────────
function makeTableMock(overrides = {}) {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert:  vi.fn().mockResolvedValue({ error: null }),
    update:  vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockResolvedValue({ data: null, error: null }),
    single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

/** Wait until the Stripe modal's pay button is mounted in the DOM. */
async function waitForModal() {
  await vi.waitFor(
    () => { if (!document.getElementById('stripe-pay')) throw new Error('Modal not yet mounted') },
    { timeout: 2000 },
  )
}

// ── Default gift params ────────────────────────────────────────
const GIFT_USD = {
  senderId: 'u1', senderEmail: 'u1@test.com',
  receiverId: 'r1', streamId: 's1',
  amountUsd: 5, emoji: 'diamond', message: 'great stream',
  currency: 'USD',
}

// ══════════════════════════════════════════════════════════════
// toLocal — currency conversion
// ══════════════════════════════════════════════════════════════
describe('toLocal', () => {
  it('converts USD to KES at the declared rate', () => {
    expect(toLocal(1, 'KES')).toBe(129)
  })

  it('converts USD to GHS', () => {
    expect(toLocal(10, 'GHS')).toBe(142)
  })

  it('leaves USD amounts at 1:1', () => {
    expect(toLocal(5, 'USD')).toBe(5)
  })

  it('treats unknown currency codes as 1:1', () => {
    expect(toLocal(7, 'XYZ')).toBe(7)
  })

  it('returns a number rounded to 2 decimal places', () => {
    const result = toLocal(1, 'GBP') // 0.79
    expect(result).toBe(0.79)
  })
})

// ══════════════════════════════════════════════════════════════
// sendGift — Stripe path (non-African currency)
// ══════════════════════════════════════════════════════════════
describe('sendGift — Stripe path (USD)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => makeTableMock())
    mockFunctionsInvoke.mockResolvedValue({ data: { clientSecret: 'pi_test_cs' }, error: null })
    mockStripe.confirmPayment.mockResolvedValue({
      paymentIntent: { id: 'pi_test_123', status: 'succeeded' },
    })
    window.PaystackPop = undefined
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('calls the Edge Function with the correct params', async () => {
    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('create-payment-intent', {
      body: {
        amountUsd: 5,
        currency: 'usd',
        metadata: {
          type: 'gift',
          senderId: 'u1',
          receiverId: 'r1',
          streamId: 's1',
          emoji: 'diamond',
          message: 'great stream',
        },
      },
    })
  })

  it('mounts a Stripe Payment Element', async () => {
    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(mockStripe.elements).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'pi_test_cs' }),
    )
    expect(mockElements.create).toHaveBeenCalledWith('payment')
    expect(mockPaymentElement.mount).toHaveBeenCalled()
  })

  it('calls confirmPayment with redirect: if_required', async () => {
    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(mockStripe.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ redirect: 'if_required' }),
    )
  })

  it('applies a 10% platform cut', async () => {
    const giftsInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation(table =>
      table === 'gifts' ? { insert: giftsInsert } : makeTableMock(),
    )

    const promise = sendGift({ ...GIFT_USD, amountUsd: 100, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(giftsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ platform_cut: 10, streamer_cut: 90 }),
    )
  })

  it('saves a payment record to Supabase on success', async () => {
    const paymentsInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation(table =>
      table === 'payments' ? { insert: paymentsInsert } : makeTableMock(),
    )

    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(paymentsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id:       'u1',
        type:          'gift',
        amount_usd:    5,
        platform_cut:  0.5,
        recipient_cut: 4.5,
        currency:      'USD',
        status:        'success',
      }),
    )
  })

  it('saves a gift record to Supabase on success', async () => {
    const giftsInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation(table =>
      table === 'gifts' ? { insert: giftsInsert } : makeTableMock(),
    )

    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(giftsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_id:    'u1',
        receiver_id:  'r1',
        stream_id:    's1',
        amount_usd:   5,
        emoji:        'diamond',
        platform_cut: 0.5,
        streamer_cut: 4.5,
        currency_code: 'USD',
      }),
    )
  })

  it('calls onSuccess with amount and cut breakdown', async () => {
    const onSuccess = vi.fn()
    const promise = sendGift({ ...GIFT_USD, onSuccess, onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ amountUsd: 5, streamerCut: 4.5, platformCut: 0.5, emoji: 'diamond' }),
    )
  })

  it('removes the modal from the DOM after a successful payment', async () => {
    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    expect(document.getElementById('stripe-pay')).not.toBeNull()

    document.getElementById('stripe-pay').click()
    await promise

    expect(document.getElementById('stripe-pay')).toBeNull()
  })

  it('destroys the Payment Element after a successful payment', async () => {
    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(mockPaymentElement.destroy).toHaveBeenCalled()
  })

  it('calls onCancel and removes the modal when Cancel is clicked', async () => {
    const onCancel = vi.fn()
    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel })
    await waitForModal()

    document.getElementById('stripe-cancel').click()
    await promise

    expect(onCancel).toHaveBeenCalled()
    expect(document.getElementById('stripe-cancel')).toBeNull()
  })

  it('does not call onSuccess when cancelled', async () => {
    const onSuccess = vi.fn()
    const promise = sendGift({ ...GIFT_USD, onSuccess, onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-cancel').click()
    await promise

    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows the card error message inline and keeps the modal open', async () => {
    mockStripe.confirmPayment
      .mockResolvedValueOnce({ error: { message: 'Your card was declined.', type: 'card_error' } })
      .mockResolvedValueOnce({ paymentIntent: { id: 'pi_retry', status: 'succeeded' } })

    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()

    // First click → card error
    document.getElementById('stripe-pay').click()
    await vi.waitFor(() => {
      if (!document.getElementById('stripe-err')?.textContent) throw new Error('Error not yet shown')
    })

    expect(document.getElementById('stripe-err').textContent).toBe('Your card was declined.')
    expect(document.getElementById('stripe-pay')).not.toBeNull() // modal still open

    // Second click → success
    document.getElementById('stripe-pay').click()
    await promise
    expect(document.getElementById('stripe-pay')).toBeNull()
  })

  it('re-enables the Pay button after a card error', async () => {
    mockStripe.confirmPayment
      .mockResolvedValueOnce({ error: { message: 'Insufficient funds.', type: 'card_error' } })
      .mockResolvedValueOnce({ paymentIntent: { id: 'pi_ok', status: 'succeeded' } })

    const promise = sendGift({ ...GIFT_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()

    await vi.waitFor(() => {
      if (document.getElementById('stripe-pay')?.disabled) throw new Error('Button still disabled')
    })
    expect(document.getElementById('stripe-pay').disabled).toBe(false)

    document.getElementById('stripe-pay').click()
    await promise
  })

  it('shows alert and does not call onSuccess when the Edge Function returns an error', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { error: 'Invalid amount' }, error: null })
    const onSuccess = vi.fn()

    await sendGift({ ...GIFT_USD, onSuccess, onCancel: vi.fn() })

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Invalid amount'))
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows alert when the Edge Function call itself fails', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'Network error' } })
    const onSuccess = vi.fn()

    await sendGift({ ...GIFT_USD, onSuccess, onCancel: vi.fn() })

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Network error'))
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════
// sendGift — Paystack path (African currencies)
// ══════════════════════════════════════════════════════════════
describe('sendGift — Paystack path (KES)', () => {
  let capturedConfig = {}
  const mockOpenIframe = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    capturedConfig = {}
    mockFrom.mockImplementation(() => makeTableMock())
    window.PaystackPop = {
      setup: vi.fn(cfg => { capturedConfig = cfg; return { openIframe: mockOpenIframe } }),
    }
  })

  it('uses Paystack and does not call the Edge Function', async () => {
    sendGift({ ...GIFT_USD, currency: 'KES', onSuccess: vi.fn(), onCancel: vi.fn() })
    await vi.waitFor(() => { if (!mockOpenIframe.mock.calls.length) throw new Error() })

    expect(mockFunctionsInvoke).not.toHaveBeenCalled()
    expect(mockOpenIframe).toHaveBeenCalled()
  })

  it('passes the converted KES amount to Paystack in smallest units', async () => {
    // $1 USD = 129 KES → Paystack amount = 129 * 100 = 12900 kobo/pesewas
    sendGift({ ...GIFT_USD, amountUsd: 1, currency: 'KES', onSuccess: vi.fn(), onCancel: vi.fn() })
    await vi.waitFor(() => { if (!mockOpenIframe.mock.calls.length) throw new Error() })

    expect(window.PaystackPop.setup).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12900, currency: 'KES' }),
    )
  })

  it('sends the correct email to Paystack', async () => {
    sendGift({ ...GIFT_USD, currency: 'KES', onSuccess: vi.fn(), onCancel: vi.fn() })
    await vi.waitFor(() => { if (!mockOpenIframe.mock.calls.length) throw new Error() })

    expect(window.PaystackPop.setup).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'u1@test.com' }),
    )
  })

  it('calls onSuccess and saves records after Paystack confirms', async () => {
    const paymentsInsert = vi.fn().mockResolvedValue({ error: null })
    const giftsInsert    = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation(table => {
      if (table === 'payments') return { insert: paymentsInsert }
      if (table === 'gifts')    return { insert: giftsInsert }
      return makeTableMock()
    })
    const onSuccess = vi.fn()

    const promise = sendGift({ ...GIFT_USD, currency: 'KES', onSuccess, onCancel: vi.fn() })
    await vi.waitFor(() => { if (!mockOpenIframe.mock.calls.length) throw new Error() })

    // Simulate Paystack confirming payment
    capturedConfig.onSuccess({ reference: 'ps_ref_abc' })
    await promise

    expect(paymentsInsert).toHaveBeenCalled()
    expect(giftsInsert).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalled()
  })

  it('calls onCancel when Paystack is cancelled', async () => {
    const onCancel = vi.fn()
    const promise = sendGift({ ...GIFT_USD, currency: 'KES', onSuccess: vi.fn(), onCancel })
    await vi.waitFor(() => { if (!mockOpenIframe.mock.calls.length) throw new Error() })

    capturedConfig.onCancel()
    await promise

    expect(onCancel).toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════
// subscribeToStreamer — Stripe path (USD)
// ══════════════════════════════════════════════════════════════
describe('subscribeToStreamer — Stripe path (USD)', () => {
  const SUB_USD = {
    subscriberId: 'u1', subscriberEmail: 'u1@test.com',
    streamerId: 'str1', plan: 'monthly', priceUsd: 9.99,
    currency: 'USD',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => makeTableMock())
    mockFunctionsInvoke.mockResolvedValue({ data: { clientSecret: 'pi_sub_cs' }, error: null })
    mockStripe.confirmPayment.mockResolvedValue({
      paymentIntent: { id: 'pi_sub_123', status: 'succeeded' },
    })
    window.PaystackPop = undefined
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('applies a 20% platform cut', async () => {
    const paymentsInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation(table =>
      table === 'payments' ? { insert: paymentsInsert } : makeTableMock(),
    )

    const promise = subscribeToStreamer({ ...SUB_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    // +(9.99 * 0.20).toFixed(2) = 2, +(9.99 * 0.80).toFixed(2) = 7.99
    expect(paymentsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'subscription', platform_cut: 2, recipient_cut: 7.99 }),
    )
  })

  it('upserts the subscription record on success', async () => {
    const subsUpsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation(table =>
      table === 'subscriptions' ? { upsert: subsUpsert } : makeTableMock(),
    )

    const promise = subscribeToStreamer({ ...SUB_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(subsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriber_id: 'u1',
        streamer_id:   'str1',
        plan:          'monthly',
        status:        'active',
      }),
      expect.objectContaining({ onConflict: 'subscriber_id,streamer_id' }),
    )
  })

  it('calls onSuccess after subscription is saved', async () => {
    const onSuccess = vi.fn()
    const promise = subscribeToStreamer({ ...SUB_USD, onSuccess, onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(onSuccess).toHaveBeenCalled()
  })

  it('passes plan and priceUsd metadata to the Edge Function', async () => {
    const promise = subscribeToStreamer({ ...SUB_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('create-payment-intent', {
      body: expect.objectContaining({
        amountUsd: 9.99,
        metadata: expect.objectContaining({ type: 'subscription', plan: 'monthly' }),
      }),
    })
  })
})

// ══════════════════════════════════════════════════════════════
// payStreamerFee
// ══════════════════════════════════════════════════════════════
describe('payStreamerFee', () => {
  const FEE_USD = { userId: 'u1', userEmail: 'u1@test.com', currency: 'USD' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => makeTableMock())
    mockFunctionsInvoke.mockResolvedValue({ data: { clientSecret: 'pi_fee_cs' }, error: null })
    mockStripe.confirmPayment.mockResolvedValue({
      paymentIntent: { id: 'pi_fee_123', status: 'succeeded' },
    })
    window.PaystackPop = undefined
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('charges exactly $4.99', async () => {
    const promise = payStreamerFee({ ...FEE_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('create-payment-intent', {
      body: expect.objectContaining({ amountUsd: 4.99 }),
    })
  })

  it('updates the profile to is_streamer: true on success', async () => {
    const profileUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const profileUpdate   = vi.fn().mockReturnValue({ eq: profileUpdateEq })
    mockFrom.mockImplementation(table =>
      table === 'profiles' ? { update: profileUpdate } : makeTableMock(),
    )
    const onSuccess = vi.fn()

    const promise = payStreamerFee({ ...FEE_USD, onSuccess, onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ is_streamer: true, fee_paid: true, streamer_verified: true }),
    )
    expect(profileUpdateEq).toHaveBeenCalledWith('id', 'u1')
    expect(onSuccess).toHaveBeenCalled()
  })

  it('records the full $4.99 as platform_cut (no streamer share)', async () => {
    const paymentsInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation(table =>
      table === 'payments' ? { insert: paymentsInsert } : makeTableMock(),
    )

    const promise = payStreamerFee({ ...FEE_USD, onSuccess: vi.fn(), onCancel: vi.fn() })
    await waitForModal()
    document.getElementById('stripe-pay').click()
    await promise

    expect(paymentsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ platform_cut: 4.99, recipient_cut: 0, type: 'streamer_fee' }),
    )
  })
})
