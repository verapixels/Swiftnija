import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://xzizayegzutgmirvywqv.supabase.co',  // ← your URL
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6aXpheWVnenV0Z21pcnZ5d3F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDIxODEsImV4cCI6MjA4NzI3ODE4MX0.8cIPZVqcHk1rIJNomB9ZZVUSEZZZLTWCTnkAui1w8Aw'                  // ← your key
);