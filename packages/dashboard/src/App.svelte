<script>
  import { onMount } from "svelte"
  import Ring from "./Ring.svelte"

  let data = $state(null)
  let feed = $state([])
  let error = $state("")

  async function refresh() {
    try {
      const [stateRes, feedRes] = await Promise.all([
        fetch("/api/state"),
        fetch("/api/feed"),
      ])
      data = await stateRes.json()
      feed = await feedRes.json()
      error = ""
    } catch (e) {
      error = String(e)
    }
  }

  onMount(() => {
    refresh()
    const es = new EventSource("/api/events")
    es.addEventListener("state", refresh)
    es.onerror = () => {}
    const timer = setInterval(refresh, 15000)
    return () => {
      es.close()
      clearInterval(timer)
    }
  })

  const verified = $derived(data ? data.counts.verified ?? 0 : 0)
  const total = $derived(data ? data.counts.total ?? 0 : 0)
</script>

<main>
  <header>
    <Ring {verified} {total} />
    <div class="titles">
      <h1>VibeTracker</h1>
      <p>{verified}/{total} criteria verified</p>
      {#if data && data.updatedAt}
        <p class="muted">updated {data.updatedAt}</p>
      {/if}
    </div>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if data && data.parseErrors.length > 0}
    <section class="card">
      <h2>ROADMAP parse errors</h2>
      <ul class="errors">
        {#each data.parseErrors as message}
          <li>{message}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if data}
    {#each data.phases as phase (phase.number)}
      <section class="card">
        <h2>
          Phase {phase.number}: {phase.name}
          <span class="score">{phase.verified}/{phase.total}</span>
        </h2>
        {#each phase.tasks as task (task.id)}
          <div class="task">
            <h3>Task {task.id}: {task.title}</h3>
            <ul>
              {#each task.criteria as criterion (criterion.id)}
                <li>
                  <span class="badge {criterion.status}">{criterion.status}</span>
                  <span class="cid">{criterion.id}</span>
                  {criterion.text}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </section>
    {/each}
  {:else}
    <p class="loading">loading…</p>
  {/if}

  <section class="card">
    <h2>Audit feed</h2>
    {#if feed.length === 0}
      <p class="muted">no audit entries yet</p>
    {:else}
      <ul class="feed">
        {#each feed as entry, i (i)}
          <li>
            <span class="at">{entry.at?.slice(0, 19).replace("T", " ")}</span>
            <span class="kind">{entry.kind}</span>
            {#if entry.snapshot}
              <span class="muted">
                ({Object.keys(entry.snapshot.criteria ?? {}).length} criteria)
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0f1117;
    color: #e6e8ef;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  }
  main {
    max-width: 780px;
    margin: 0 auto;
    padding: 24px 16px 60px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 22px;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    letter-spacing: 1px;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 15px;
  }
  h3 {
    margin: 10px 0 4px;
    font-size: 13px;
    color: #aeb4c4;
  }
  .titles p {
    margin: 2px 0;
  }
  .muted {
    color: #7d8496;
    font-size: 11px;
  }
  .score {
    color: #7d8496;
    font-weight: normal;
  }
  .card {
    background: #171a23;
    border: 1px solid #262b3a;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 14px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 12px;
  }
  li {
    padding: 3px 0;
  }
  .badge {
    display: inline-block;
    min-width: 74px;
    text-align: center;
    border-radius: 4px;
    font-size: 10px;
    padding: 1px 6px;
    background: #262b3a;
    color: #9aa1b2;
  }
  .badge.verified { background: #12351f; color: #5ee08a; }
  .badge.in_review { background: #14283f; color: #6fb3ff; }
  .badge.failed { background: #3b1518; color: #ff7885; }
  .badge.drift { background: #3b2c11; color: #ffc861; }
  .badge.blocked { background: #3b1113; color: #ff6b70; }
  .badge.in_progress { background: #243043; color: #93c7ff; }
  .cid {
    color: #7d8496;
    margin: 0 6px;
  }
  .errors li {
    color: #ff7885;
  }
  .feed .at {
    color: #7d8496;
    margin-right: 8px;
  }
  .feed .kind {
    color: #6fb3ff;
  }
  .loading {
    color: #7d8496;
  }
</style>
