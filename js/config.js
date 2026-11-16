// Supabase connection + flags.
// Leave the two values empty to keep running the offline DEMO (js/store.js).
// Fill them (Project URL + anon public key) to switch to the shared Supabase back end.
// See docs/SUPABASE_SETUP.md.
window.CONFIG = {
  SUPABASE_URL: 'https://lgjpllohlhxqmfemjibi.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_KcNgbeAHrResAZca-PjwgQ_fXvse4Xq',  // publishable key, safe in the client (RLS on)

  // Interim: while there is no organisers' back office, the phone that submits a
  // proof also approves it and writes the points. Set to false once the back
  // office validates proofs.
  AUTO_APPROVE: true
};
