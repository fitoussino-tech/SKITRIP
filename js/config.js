// Supabase connection + flags.
// Leave the two values empty to keep running the offline DEMO (js/store.js).
// Fill them (Project URL + anon public key) to switch to the shared Supabase back end.
// See docs/SUPABASE_SETUP.md.
window.CONFIG = {
  SUPABASE_URL: '',       // e.g. 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: '',  // the "anon public" key (safe to ship in the client)

  // Interim: while there is no organisers' back office, the phone that submits a
  // proof also approves it and writes the points. Set to false once the back
  // office validates proofs.
  AUTO_APPROVE: true
};
