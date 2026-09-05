<script setup lang="ts">
defineProps<{
  name: 'overview' | 'create' | 'characters' | 'stories' | 'works'
}>()
</script>

<template>
  <svg
    class="brand-nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g v-if="name === 'overview'">
      <path d="M4.25 5.75c0-.83.67-1.5 1.5-1.5h4v6h-5.5v-4.5ZM14.25 4.25h4c.83 0 1.5.67 1.5 1.5v8h-5.5v-9.5ZM4.25 14.25h5.5v5.5h-4c-.83 0-1.5-.67-1.5-1.5v-4ZM14.25 18.25h5.5" />
      <circle
        cx="17"
        cy="18.25"
        r="1.15"
        class="icon-gem"
      />
    </g>

    <g v-else-if="name === 'create'">
      <path d="M4.25 8V5.7c0-.8.65-1.45 1.45-1.45H8M16 4.25h2.3c.8 0 1.45.65 1.45 1.45V8M19.75 16v2.3c0 .8-.65 1.45-1.45 1.45H16M8 19.75H5.7c-.8 0-1.45-.65-1.45-1.45V16" />
      <path d="M7.2 15.9c2.3.2 3.15-1.05 3.35-2.7.28-2.38 1.45-4.16 4.52-4.54-1.3 1.06-1.2 2.05-.26 2.74 1.24.91 1.44 2.48.57 3.69-.95 1.32-2.89 1.84-4.62 1.08" />
      <path
        d="m16.86 6.2.28.72.72.28-.72.28-.28.72-.28-.72-.72-.28.72-.28.28-.72Z"
        class="icon-gem"
      />
    </g>

    <g v-else-if="name === 'characters'">
      <path d="m7.2 7.1.65-3.15 2.7 2.12c.48-.12.97-.18 1.45-.18s.97.06 1.45.18l2.7-2.12.65 3.15" />
      <path d="M17.7 11.16c0 3.25-2.55 5.64-5.7 5.64s-5.7-2.39-5.7-5.64C6.3 8.1 8.73 5.9 12 5.9s5.7 2.2 5.7 5.26Z" />
      <path d="M8.15 19.9c.8-1.78 2.1-2.7 3.85-2.7s3.05.92 3.85 2.7M9.35 10.45h.02M14.63 10.45h.02" />
      <path d="M10.55 13.42c.82.55 2.08.55 2.9 0" />
    </g>

    <g v-else-if="name === 'stories'">
      <path d="M6.15 5.15h10.6c.78 0 1.4.62 1.4 1.4v9.8c0 .78-.62 1.4-1.4 1.4H6.15c-.78 0-1.4-.62-1.4-1.4v-9.8c0-.78.62-1.4 1.4-1.4Z" />
      <path d="M7.15 2.95h10.7c1.77 0 3.2 1.43 3.2 3.2v9.7M7.2 9.05c2.04-1.14 3.34-.47 4.25.84 1.05 1.5 2.31 2.16 4.48 1.39" />
      <circle
        cx="7.2"
        cy="9.05"
        r=".72"
        class="icon-gem"
      />
      <circle
        cx="15.93"
        cy="11.28"
        r=".72"
        class="icon-gem"
      />
    </g>

    <g v-else>
      <path d="M4.15 6.15c0-.88.72-1.6 1.6-1.6h12.5c.88 0 1.6.72 1.6 1.6v11.7c0 .88-.72 1.6-1.6 1.6H5.75c-.88 0-1.6-.72-1.6-1.6V6.15Z" />
      <path d="m10.15 8.65 5.1 3.35-5.1 3.35v-6.7Z" />
      <path d="M4.15 7.55h15.7M7.35 4.55l1.55 3M12.25 4.55l1.55 3M17.15 4.55l1.55 3" />
      <path
        d="m18.2 2.7.23.6.6.23-.6.23-.23.6-.23-.6-.6-.23.6-.23.23-.6Z"
        class="icon-gem"
      />
    </g>
  </svg>
</template>

<style scoped>
.brand-nav-icon {
  width: 23px;
  height: 23px;
  overflow: visible;
  stroke: currentColor;
  stroke-width: 1.45;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-gem {
  fill: currentColor;
  stroke-width: 0;
}
</style>
