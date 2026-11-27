// Which battery lane holds which battery, and the table that decides it.
//
// ## The complaint
//
// Five CI jobs are not five kinds of work. They are five **series of independent mutation
// batteries**: `gates-audit` four, `batteries-heavy` two, `batteries` eleven, `sensitivity`
// two, `sensitivity-shard` one. No battery in a series reads another's result, so the only
// thing the grouping decides is how long a runner waits for the slowest lane -- and the
// workflow's wall clock is that lane. The grouping was placed by hand, one battery at a
// time, each move argued on its own; reading 64 measured the result: **443 / 376 / 371 /
// 134 / 115 s** of battery work on one tree, a **3.9x** spread, and the run waiting on the
// first of them (finding 679's round, `O-148`).
//
// ## What this module is
//
// `golden-master/battery-lanes.json` prices every battery step from one recorded run, and
// this module places them: longest-processing-time first over a fixed number of lanes, then
// a matching of the lanes to the workflow's job ids that leaves the most steps where they
// already are. `assignShards` solved the same problem for one battery's claimants in
// v3.157, and the argument is the same one: a split by **live** seconds would put a step in
// a different lane on every machine, and a split by a **committed table** derives the same
// lanes everywhere, because the numbers are in the repository.
//
// ## The unit is not always a step
//
// `publish-battery-report.py` writes the report `gate-tests-battery.py` produced, and
// `upload-artifact` attaches that same file; a lane that placed them apart would upload
// nothing and publish under a job that never ran the battery. So a row may carry a
// `group`, and a group is placed as one unit: its steps share a lane and keep the table's
// order inside it. The group's seconds are its steps' seconds, which is what a lane pays
// for holding it.
//
// ## The rule
//
// Longest-processing-time first: the dearest unit is placed on the emptiest lane, and so
// on down. Ties are broken by the group's key, so the placement is a pure function of the
// table's numbers and names -- not of the order the rows happen to be written in. LPT is a
// 4/3-approximation to bin packing and is not claimed to be optimal; what it buys is a
// spread bounded by the dearest unit rather than by how the history happened to arrive.
//
// The lanes then need names. The workflow's job ids are addresses: `R11` counts them, the
// recording is keyed by them, `moved` in `ci-declarations.json` is defined by a step leaving
// one and arriving at another -- so a lane cannot be given a fresh id in the same commit
// that empties its old one. `matchJobs` therefore tries every assignment of lanes to the
// tree's existing ids and keeps the one that leaves the most rows where they already are,
// which is the arrangement that moves the least text and keeps each id closest to what it
// used to hold. The matching is stable: after a round has reshaped the workflow, every row
// already sits on its lane, the identity matching keeps all of them, and re-deriving from
// the same table gives the same labels.
//
// ## Where each row was read, and why the order is not free
//
// A row carries `from`: the job the named reading measured the step in. That is a fact about
// the reading rather than about the plan, and it is the field `laneOrderOf` reads. A step the
// record has not measured *in its new job* is a step whose deadline cannot be argued -- every
// bound behind it would be computed from a sum with a hole -- so `R8` refuses it unless it is
// the last of the job, and a lane therefore writes the rows it already ran first. Once a
// reading has measured a lane's steps in that lane, every `from` of that lane equals the lane
// and the order collapses into the table's own, which is the order the placement chose.
//
// ## What this module deliberately does not do
//
// It does not measure. The seconds in the table are a reading's, and the table names which
// reading -- `laneErrors` refuses a row whose number the named run did not produce, so the
// one hand-written thing here is the *selection* of a run rather than a number. It does not
// price the prefix either: every lane pays one, the lanes' prefixes differ by seconds of
// package-mirror noise, and a model that divided by them would be dividing by the machine.

/** The fields a table row may carry. Anything else is a measurement nobody asked for. */
export const ROW_KEYS = ['step', 'command', 'seconds', 'group', 'lane', 'from'];

/** The fields the table itself may carry. */
export const TABLE_KEYS = ['rule', 'reading', 'run', 'commit', 'measured', 'unit', 'jobs', 'steps'];

/**
 * The unit a row is placed as: its group, or the step itself when it stands alone.
 *
 * Named rather than inlined because three functions and every message have to agree on it,
 * and a second spelling of "what a unit is" is how a partition becomes two partitions.
 */
export function unitKeyOf(row) {
  return typeof row?.group === 'string' && row.group !== '' ? row.group : String(row?.step ?? '');
}

/**
 * The table's rows as the units a lane is filled with.
 *
 * A unit's seconds are the sum of its steps' seconds, and its `at` is the position of its
 * first row -- used only to keep the units in the order they are written when two are
 * equally dear, so that a reader comparing the table with the placement sees one order
 * rather than one of several.
 */
export function laneUnits(rows) {
  const order = new Map();
  const units = new Map();
  for (const [index, row] of rows.entries()) {
    const key = unitKeyOf(row);
    const seconds = Number(row?.seconds);
    if (!units.has(key)) {
      units.set(key, { key, seconds: 0, rows: [], at: index });
      order.set(key, index);
    }
    const unit = units.get(key);
    unit.seconds += Number.isFinite(seconds) ? seconds : 0;
    unit.rows.push(row);
  }
  return [...units.values()];
}

/**
 * The lanes, dearest unit first onto the emptiest lane.
 *
 * Returns the lanes as lists of rows in placement order: a group's steps stay together, and
 * the units of a lane appear in the order they were placed, dearest first. That order is the
 * plan's; the workflow writes `laneOrderOf`'s, which is the plan's with the steps that have
 * not yet been measured in their new lane moved to the end.
 */
export function placeLanes(rows, count) {
  if (!Number.isInteger(count) || count < 1) return { lanes: [], units: [], error: `a split into ${String(count)} lane(s) is not a split` };
  const units = laneUnits(rows);
  const dearest = [...units].sort((left, right) => right.seconds - left.seconds || left.key.localeCompare(right.key));
  const placed = new Array(count).fill(0);
  const lanes = Array.from({ length: count }, () => []);
  const keys = Array.from({ length: count }, () => []);
  for (const unit of dearest) {
    let pick = 0;
    for (let one = 1; one < count; one += 1) {
      if (placed[one] < placed[pick]) pick = one;
    }
    placed[pick] += unit.seconds;
    keys[pick].push(unit.key);
    for (const row of unit.rows) lanes[pick].push(row);
  }
  return { lanes, units: keys, error: null };
}

/** What each lane's rows have cost: the one number the workflow's wall clock is the max of. */
export function laneLoads(lanes) {
  return lanes.map((rows) => rows.reduce((total, row) => total + (Number(row?.seconds) || 0), 0));
}

/**
 * The order a lane's steps have to appear in.
 *
 * `R8` refuses a step the recording has not measured *in this job* unless it is the last of
 * the job -- the deadline for every bound behind it would be argued from a sum with a hole
 * in it. A row that moved therefore has to run after the rows that were read where they
 * already are, and `from` is the field that says which is which: the job the named reading
 * measured the step in. Once a reading has measured a lane's steps in that lane, every
 * `from` of that lane equals the lane's job and this rule collapses into the table's own
 * order, which is the order the placement chose.
 *
 * The rule is written here rather than in the workflow because it is a property of the
 * table: a reader can see, from the table alone, which lanes are still waiting for their
 * first reading and which steps that waiting puts last.
 */
export function laneOrderOf(rows, jobIds) {
  return jobIds.map((id, lane) => {
    const mine = rows.filter((row) => row.lane === lane);
    return [...mine.filter((row) => row.from === id), ...mine.filter((row) => row.from !== id)].map((row) => row.step);
  });
}

/**
 * Which job id each lane should be given, by the assignment that leaves the most rows in place.
 *
 * Every permutation of the ids is scored -- five lanes is 120 of them, and a rule that
 * needed a cleverer search would be a rule nobody could check by reading it. The score is
 * the number of rows whose lane's id is the job the row sits in *today*; ties go to the
 * permutation that sorts first by id, so the answer does not depend on the order the
 * permutations were generated in.
 *
 * `currentJobOf` is a function rather than a map because a step's name is unique inside
 * the workflow and a reader passing a map would have to decide what a duplicate means.
 */
export function matchJobs(lanes, currentJobOf, jobIds) {
  if (!Array.isArray(jobIds) || jobIds.length !== lanes.length) {
    return { jobs: [], stays: 0, error: `the table splits into ${String(lanes.length)} lane(s) and the workflow offers ${String(jobIds?.length ?? 0)} id(s)` };
  }
  const permutations = [];
  const walk = (rest, acc) => {
    if (rest.length === 0) {
      permutations.push(acc);
      return;
    }
    for (let index = 0; index < rest.length; index += 1) {
      walk([...rest.slice(0, index), ...rest.slice(index + 1)], [...acc, rest[index]]);
    }
  };
  walk(jobIds, []);
  let best = null;
  for (const permutation of permutations) {
    let stays = 0;
    for (const [index, rows] of lanes.entries()) {
      for (const row of rows) {
        if (currentJobOf(row.step) === permutation[index]) stays += 1;
      }
    }
    const key = permutation.join('\u0000');
    if (best === null || stays > best.stays || (stays === best.stays && key < best.key)) {
      best = { jobs: permutation, stays, key };
    }
  }
  return { jobs: best.jobs, stays: best.stays, error: null };
}

/**
 * The table, read into the shape the checks work in.
 *
 * Shape errors are returned rather than thrown, for the reason `readDeclarations` does the
 * same: this module is what a gate, a test and a reader all call, and a reader that has to
 * catch an exception to learn that a field is missing learns less than one that is handed
 * the sentence.
 */
export function readLaneTable(table) {
  const errors = [];
  if (table === null || typeof table !== 'object' || Array.isArray(table)) {
    return { rows: [], jobs: [], run: null, errors: ['the lane table is not an object, so it places nothing'] };
  }
  for (const key of Object.keys(table)) {
    if (!TABLE_KEYS.includes(key)) errors.push(`the lane table carries \`${key}\`, which is not a field a plan has`);
  }
  const jobs = Array.isArray(table.jobs) ? table.jobs.map((one) => String(one)) : null;
  if (jobs === null || jobs.length === 0) {
    errors.push('the lane table names no job: a plan whose lanes have no addresses cannot be compared with the workflow');
  } else if (new Set(jobs).size !== jobs.length) {
    errors.push('the lane table names the same job twice, so two lanes would claim one id');
  }
  if (!Number.isInteger(table.reading) || table.reading < 1) {
    errors.push(`the lane table names reading ${String(table.reading)}, which is not a reading: the seconds have to come from one`);
  }
  if (!Number.isInteger(table.run) || table.run < 1) {
    errors.push(`the lane table names run ${String(table.run)}, which is not a run id: the numbers would be ones somebody typed`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(table.commit ?? ''))) {
    errors.push('the lane table names no commit, so a reader cannot tell which tree the seconds describe');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(table.measured ?? ''))) {
    errors.push('the lane table has no measurement date: a plan whose prices cannot be dated cannot be re-derived');
  }
  const rows = Array.isArray(table.steps) ? table.steps : null;
  if (rows === null || rows.length === 0) {
    errors.push('the lane table places no step, so there is nothing to compare with the workflow');
    return { rows: [], jobs: jobs ?? [], run: null, errors };
  }
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const where = `the lane table's row ${String(index + 1)}`;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`${where} is not an object, so it places nothing`);
      continue;
    }
    for (const key of Object.keys(row)) {
      if (!ROW_KEYS.includes(key)) errors.push(`${where} carries \`${key}\`, which is not a field a plan has`);
    }
    const step = String(row.step ?? '');
    if (step === '') {
      errors.push(`${where} names no step`);
      continue;
    }
    if (seen.has(step)) {
      errors.push(`${where} places \`${step}\` a second time, so two lanes would run it`);
      continue;
    }
    seen.add(step);
    if (String(row.command ?? '') === '') errors.push(`${where} (\`${step}\`) names no command, so a reader cannot check the name against the workflow`);
    if (!Number.isInteger(row.seconds) || row.seconds < 0) {
      errors.push(`${where} (\`${step}\`) has ${String(row.seconds)} seconds: a price is a whole number of seconds a run spent`);
    }
    if (row.group !== undefined && (typeof row.group !== 'string' || row.group === '')) {
      errors.push(`${where} (\`${step}\`) carries a group that is not a name: a unit is a group's key or the step itself`);
    }
    if (!jobs.includes(String(row.from ?? ''))) {
      errors.push(`${where} (\`${step}\`) says the reading measured it in \`${String(row.from)}\`, which is not one of the table's jobs`);
    }
    if (!Number.isInteger(row.lane) || row.lane < 0 || row.lane >= (jobs?.length ?? 0)) {
      errors.push(`${where} (\`${step}\`) is placed on lane ${String(row.lane)}, which is not one of the ${String(jobs?.length ?? 0)} lanes the table names`);
    }
  }
  return { rows, jobs: jobs ?? [], run: Number.isInteger(table.run) ? table.run : null, errors };
}

/**
 * The leading steps the lanes share: what a lane pays before its first battery.
 *
 * Derived from the five lane jobs themselves rather than read off the workflow-wide prefix,
 * because the workflow-wide prefix stops where the jobs stop agreeing -- `backend` has no
 * `Install the shells` step, so the shared prefix is four steps and the two steps that are
 * setup for every lane would be counted as battery work. A lane's prefix is the run of
 * leading steps that every lane runs identically, name and command both.
 */
export function lanePrefixOf(stepsByJob) {
  const lists = Object.values(stepsByJob);
  if (lists.length === 0) return [];
  const prefix = [];
  for (let index = 0; ; index += 1) {
    const at = lists.map((steps) => steps[index]);
    if (at.some((step) => step === undefined)) break;
    const signature = `${at[0].name}\u0000${String(at[0].command ?? '')}`;
    if (at.some((step) => `${step.name}\u0000${String(step.command ?? '')}` !== signature)) break;
    prefix.push(at[0].name);
  }
  return prefix;
}

/**
 * Everything the lane plan and the workflow can disagree about.
 *
 * `workflowSteps` is the list `stepsOf` returns for a job id (name, command, order), and
 * `readingSteps` is the run the table names, as `{ job, name, command, seconds }` rows.
 * Both are handed in rather than read here so the checks can be tested against a workflow
 * and a run a test wrote, which is the only way a check about a committed file can be
 * shown to refuse anything.
 *
 * The sentences are grouped so a reader sees one complaint per kind: the shape first (the
 * table cannot be read), then the population (the table and the workflow list different
 * steps), then the plan (the placement is not what the table's own rule derives), then the
 * prices (a number the named run did not produce).
 */
export function laneErrors(table, workflowSteps, readingSteps) {
  const parsed = readLaneTable(table);
  const errors = [...parsed.errors];
  if (errors.length > 0) return { errors, derived: null };
  const { rows, jobs } = parsed;

  const byJob = new Map(jobs.map((id) => [id, workflowSteps[id] ?? null]));
  for (const [id, steps] of byJob) {
    if (steps === null || steps.length === 0) {
      errors.push(`the lane table names \`${id}\`, which is not a job of ci.yml: a lane with no address runs nothing`);
    }
  }
  if (errors.length > 0) return { errors, derived: null };

  const prefix = lanePrefixOf(Object.fromEntries(byJob));
  const work = new Map();
  for (const [id, steps] of byJob) {
    work.set(id, steps.slice(prefix.length));
  }

  // The population, both directions: a battery the table does not price is a battery no
  // rule placed, and a row about a step the workflow does not have is a plan for a tree
  // that no longer exists.
  const tableByStep = new Map(rows.map((row) => [row.step, row]));
  for (const [id, steps] of work) {
    for (const step of steps) {
      const row = tableByStep.get(step.name);
      if (row === undefined) {
        errors.push(`\`${id}\` runs \`${step.name}\`, which the lane table does not place: a battery outside the plan is one the derivation never saw`);
        continue;
      }
      if (row.command !== String(step.command ?? '')) {
        errors.push(`the lane table prices \`${row.step}\` at \`${row.command}\` and ci.yml runs \`${String(step.command ?? '')}\`: a price is of a command, and these are two`);
      }
      if (jobs[row.lane] !== id) {
        errors.push(`the lane table puts \`${row.step}\` on lane ${String(row.lane)} (\`${jobs[row.lane]}\`) and ci.yml runs it in \`${id}\``);
      }
    }
  }
  const inWorkflow = new Set();
  for (const steps of work.values()) for (const step of steps) inWorkflow.add(step.name);
  for (const row of rows) {
    if (!inWorkflow.has(row.step)) {
      errors.push(`the lane table places \`${row.step}\`, which no lane job of ci.yml runs: a row about a step that is gone prices work nobody does`);
    }
  }

  // The order inside a lane: the steps the reading measured where they are, then the ones
  // it measured elsewhere -- `R8`'s lifetime, seen from the table. Two spellings of one plan
  // diff cleanly, and a group's steps cannot be separated by an edit to one file only.
  const expected = laneOrderOf(rows, jobs);
  for (const [index, id] of jobs.entries()) {
    const fromWorkflow = work.get(id).map((step) => step.name);
    if (expected[index].join('\u0000') !== fromWorkflow.join('\u0000')) {
      errors.push(
        `\`${id}\` runs its batteries as ${JSON.stringify(fromWorkflow)} and the lane table orders them ` +
          `${JSON.stringify(expected[index])}: the workflow's order is the plan's order, or the plan is two plans`,
      );
    }
  }

  // The plan, re-derived from the table's own seconds.
  const placed = placeLanes(rows, jobs.length);
  if (placed.error !== null) {
    errors.push(placed.error);
    return { errors, derived: null };
  }
  const currentJobOf = (step) => {
    for (const [id, steps] of work) if (steps.some((one) => one.name === step)) return id;
    return null;
  };
  const matched = matchJobs(placed.lanes, currentJobOf, jobs);
  if (matched.error !== null) {
    errors.push(matched.error);
    return { errors, derived: null };
  }
  const derivedLane = new Map();
  for (const [index, lane] of placed.lanes.entries()) {
    for (const row of lane) derivedLane.set(row.step, matched.jobs[index]);
  }
  for (const row of rows) {
    const derived = derivedLane.get(row.step);
    if (derived !== undefined && jobs[row.lane] !== derived) {
      errors.push(
        `the lane table puts \`${row.step}\` in \`${jobs[row.lane]}\` and its own rule derives \`${derived}\`: ` +
          'a placement that is not the one the table derives is a hand-placed split wearing a table',
      );
    }
  }

  // A group is one unit: one lane, and contiguous in it.
  const groups = new Map();
  for (const row of rows) {
    if (row.group === undefined) continue;
    const list = groups.get(row.group) ?? [];
    list.push(row);
    groups.set(row.group, list);
  }
  for (const [group, members] of groups) {
    const lanes = new Set(members.map((row) => row.lane));
    if (lanes.size !== 1) {
      errors.push(`the group \`${group}\` is split across ${String(lanes.size)} lanes: its steps read each other's output, and a lane that holds one of them holds a broken unit`);
    }
    const positions = members.map((row) => rows.indexOf(row));
    if (positions.some((at, index) => index > 0 && at !== positions[index - 1] + 1)) {
      errors.push(`the group \`${group}\` is not written as one run of rows, so a reader cannot see what the unit is`);
    }
  }

  // The prices: every row's seconds have to be a number the named run recorded for that
  // command. A row that quotes another run's number is a plan priced on a tree nobody can
  // look up, and the whole argument for deriving rather than placing is that the numbers
  // are in the repository.
  const seen = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row.seconds)) continue;
    const at = readingSteps.filter((step) => step.command === row.command);
    if (at.length === 0) {
      errors.push(`the reading the lane table names holds no step running \`${row.command}\`, so its price for \`${row.step}\` is not that reading's`);
      continue;
    }
    const named = at.find((step) => step.name === row.step);
    const seconds = named === undefined ? at[0].seconds : named.seconds;
    if (at.length > 1 && named === undefined) {
      errors.push(`the reading holds ${String(at.length)} steps running \`${row.command}\` and none of them is \`${row.step}\`, so the price is ambiguous`);
      continue;
    }
    if (row.seconds !== seconds) {
      errors.push(`the lane table prices \`${row.step}\` at ${String(row.seconds)} s and the reading it names recorded ${String(seconds)} s: a plan quotes a reading, it does not revise it`);
    }
    seen.set(row.step, seconds);
  }

  const loads = laneLoads(placed.lanes);
  return {
    errors,
    derived: {
      prefix,
      work: Object.fromEntries([...work].map(([id, steps]) => [id, steps.map((step) => step.name)])),
      loads: Object.fromEntries(jobs.map((id, index) => [id, loads[index]])),
      head: loads.length === 0 ? 0 : Math.max(...loads),
      spread: loads.length === 0 ? 0 : Math.max(...loads) - Math.min(...loads),
      stays: matched.stays,
      total: loads.reduce((total, one) => total + one, 0),
    },
  };
}
