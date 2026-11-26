---
npm/@waglo-private/dbus-next: patch
---

A message read after disconnect() is dropped instead of answered: replying threw "Cannot send message, stream is closed" from a socket event, as an uncaught exception (seen when a service and its client closed at the same time). The error reply to a handler that failed is no longer sent on a closed stream either.
