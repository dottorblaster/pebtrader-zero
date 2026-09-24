#include <pebble.h>

// The default Moddable XS heap is small (the platform default is a ~32 KB
// slot heap) and this app needs room for the Poco UI, the message layer and a
// parsed order list. These are byte counts; the watch has spare app RAM.
// The firmware requires all three of stack/slot/chunk to be non-zero when a
// custom creation record is supplied.
#define PEBBLE_JS_STACK_HEAP 4096
#define PEBBLE_JS_SLOT_HEAP 49152
#define PEBBLE_JS_CHUNK_HEAP 8192

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  ModdableCreationRecord cr = {
    .recordSize = sizeof(cr),
    .stack = PEBBLE_JS_STACK_HEAP,
    .slot = PEBBLE_JS_SLOT_HEAP,
    .chunk = PEBBLE_JS_CHUNK_HEAP,
#ifdef PBL_DEBUG
    // Built with `pebble build --debug`: enable the xsbug JavaScript debugger.
    .flags = kModdableCreationFlagDebug,
#else
    .flags = 0,
#endif
  };
  moddable_createMachine(&cr);

  window_destroy(w);
  return 0;
}
