# Browser test result v0.29.0

- Release: `0.29.0-enemy-personalities`
- Local HTTP outer entry: 200
- Local HTTP application entry: 200
- New personality module: 200
- Headless browser executable: `/usr/bin/chromium`
- Headless browser status: `failed-rc-124`

Local HTTP delivery of the outer entry, application entry and the new enemy-personality module succeeded. [25543:25571:0623/171156.662089:ERROR:dbus/bus.cc:406] Failed to connect to the bus: Could not parse server address: Unknown address type (examples of valid types are "tcp" and on UNIX "unix") [25543:25543:0623/171156.669375:ERROR:dbus/object_proxy.cc:573] Failed to call method: org.freedesktop.DBus.NameHasOwner: object_path= /org/freedesktop/DBus: unknown error type: [25543:25571:0623/171156.669504:ERROR:dbus/bus.cc:406] Failed to connect to the bus: Could not parse server address: Unknown address type (examples of valid types are "tcp" and on UNIX "unix") [25543:25543:0623/171156.673234:ERROR:dbus/object_proxy.cc:573] Failed to call method: org.freedesktop.DBus.NameHasOwner: object_path= /org/freedesktop/DBus: unknown error type: [25543:25571:0623/171156.673318:ERROR:dbus/bus.cc:406] Failed to connect to the bus: Could not parse server address: Unknown address type (examples of valid types are "tcp" and on UNIX "unix") [25543:25543:0623/171156.674976:ERROR:dbus/object_proxy.cc:573] Failed to call method: org.freedesktop.DBus.NameHasOwner: object_path= /org/freedesktop/DBus: unknown error type: [0623/171220.962738:ERROR:third_party/crashpad/crashpad/util/linux/socket.cc:182] incorrect payload size 0 [0623/171220.965848:ERROR:third_party/crashpad/crashpad/util/linux/socket.cc:182] incorrect payload size 0 

A reliable interactive test of touch input, GPS permission, live Overpass acquisition and installed-PWA update behavior cannot be completed inside this container. These items require the deployed HTTPS build on a mobile browser.
