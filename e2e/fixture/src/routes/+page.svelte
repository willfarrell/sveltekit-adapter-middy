<script>
// biome-ignore lint/correctness/noUnusedVariables: used in the markup, which Biome does not read
let { data } = $props();
</script>

<p>session:{data.session}</p>
<p>function:{data.functionName}</p>
<form method="POST" action="?/login"><button>Log in</button></form>
