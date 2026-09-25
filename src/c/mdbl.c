#include <pebble.h>

// The default Moddable XS heap is small (the platform default is a ~32 KB
// slot heap) and this app needs room for the Poco UI, the message layer and a
// parsed order list. These are byte counts; the watch has spare app RAM.
// The firmware requires all three of stack/slot/chunk to be non-zero when a
// custom creation record is supplied.
//
// App RAM is shared with the firmware heap, so these sizes and the AppMessage
// buffers in src/embeddedjs/messenger.js have to fit together: growing the JS
// heap without shrinking those buffers makes `app_message_open` fail, and the
// app faults while creating the machine. Keep the total in mind when bumping
// either side, and always check a real launch on emery and gabbro.
#define PEBBLE_JS_STACK_HEAP 4096
#define PEBBLE_JS_SLOT_HEAP 57344
#define PEBBLE_JS_CHUNK_HEAP 20480

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
