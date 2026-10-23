import { createApp } from "./app";
import { settings } from "./config";
createApp().then((app) => app.listen(settings.port, settings.host));
