// Prints a pgTAP file rewritten for the DEV fallback (docs/DATABASE.md → Tests):
// the statements run in one implicit transaction, every assertion's TAP line
// is captured into a temp table, and a final exception carries the lines out
// and rolls everything back (users, rows, the pgtap extension).
//
//   node supabase/dev/pgtap_dev.mjs supabase/tests/stage7_progress.test.sql > out.sql
//
// Run out.sql on DEV (SQL editor or the Supabase MCP execute_sql). The error
// message starts with "TAP FAILED=<n> PLANNED=<p> RAN=<r>".
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node supabase/dev/pgtap_dev.mjs <file.test.sql>");
  process.exit(1);
}

const ASSERT =
  /^select ((?:is|isnt|ok|results_eq|set_eq|bag_eq|throws_ok|lives_ok|has_\w+|hasnt_\w+|col_\w+|policies_are|tables_are|functions_are|matches|cmp_ok|is_empty|isnt_empty|row_eq|fail|pass)\()/gm;

const sql = readFileSync(file, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/^begin;\s*$/m, "")
  .replace(/^rollback;\s*$/m, "")
  .replace(/^select \* from finish\(\);\s*$/m, "")
  .replace(
    /^(select plan\(\d+\);)$/m,
    `$1
create temp table __tap_out (n serial primary key, line text);
grant all on table __tap_out to anon, authenticated;
grant all on sequence __tap_out_n_seq to anon, authenticated;`,
  )
  .replace(ASSERT, "insert into __tap_out (line) select $1");

process.stdout.write(`${sql}
reset role;
do $tap$
declare
  v_failed int;
  v_ran int;
  v_plan int;
  v_bad text;
begin
  select count(*) filter (where line like 'not ok%'), count(*),
         string_agg(line, E'\\n' order by n) filter (where line like 'not ok%')
    into v_failed, v_ran, v_bad
    from __tap_out;
  select value into v_plan from __tcache__ where label = 'plan';
  raise exception E'TAP FAILED=% PLANNED=% RAN=%\\n%', v_failed, v_plan, v_ran, coalesce(v_bad, 'all ok');
end
$tap$;
`);
