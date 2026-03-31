<template>
  <div class="user-profile">
    <h1>{{ user.name }}</h1>
    <button @click="handleSave">Save</button>
  </div>
</template>

<script>
export default {
  name: 'UserProfile',
  props: {
    userId: { type: String, required: true },
    editable: { type: Boolean, default: false },
  },
  emits: ['saved', 'cancelled'],
  methods: {
    async handleSave(event) {
      await this.$emit('saved', this.user);
    },
    handleCancel() {
      this.$emit('cancelled');
    },
    _internalReset() {},
  },
};
</script>
