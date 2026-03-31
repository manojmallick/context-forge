<script>
  export let userId;
  export let editable = false;

  let user = null;

  export async function loadUser(id) {
    user = await fetchUser(id);
  }

  function handleSave() {
    dispatch('saved', user);
  }

  $: fullName = user?.name;
</script>

<template>
  <div>
    <h1>{user?.name}</h1>
  </div>
</template>
