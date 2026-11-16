// Supabase connection + flags.
// Leave the two values empty to keep running the offline DEMO (js/store.js).
// Fill them (Project URL + anon public key) to switch to the shared Supabase back end.
// See docs/SUPABASE_SETUP.md.
window.CONFIG = {
  SUPABASE_URL: 'https://lgjpllohlhxqmfemjibi.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_KcNgbeAHrResAZca-PjwgQ_fXvse4Xq',  // publishable key, safe in the client (RLS on)

  // The organisers' back office now validates proofs, so submissions stay
  // "pending" until an admin approves them (and only then do they reach the feed
  // and earn points). Set back to true to let a submission approve itself.
  AUTO_APPROVE: false,

  // Soft gate for the admin page (admin.html). It only hides the admin UI from
  // casual visitors; change it before sharing the site. (Not hard security: the
  // light-RLS model lets the anon key write. Real auth is a later hardening step.)
  ADMIN_PASSCODE: 'menuires2027'
};
