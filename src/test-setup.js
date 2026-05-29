import { vi } from 'vitest'

// Vitest maps process.env.VITE_* into import.meta.env.VITE_* for modules under test
process.env.VITE_STRIPE_PUBLIC_KEY   = 'pk_test_mock_stripe_key'
process.env.VITE_PAYSTACK_PUBLIC_KEY = 'pk_test_mock_paystack_key'
process.env.VITE_SUPABASE_URL        = 'https://mock.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY   = 'mock_anon_key'
process.env.VITE_AGORA_APP_ID        = 'mock_agora_id'

global.alert = vi.fn()
