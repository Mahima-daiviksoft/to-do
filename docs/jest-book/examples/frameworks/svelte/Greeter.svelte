<script>
  let { name = 'world' } = $props();
  let count = $state(0);
</script>
<h1>Hello {name}!</h1>
<button onclick={() => count++}>Clicked {count}</button>
