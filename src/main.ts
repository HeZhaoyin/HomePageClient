import { createApp, App as VueApp } from "vue";
import "./assets/style/global.less";
import router from "./router/index";
import App from "./App.vue";
import HpInput from "./components/HpInput.vue";
import HpButton from "./components/HpButton.vue";
import HpUpload from "./components/HpUpload.vue";
import HpDialog from "./components/HpDialog.vue";
import HpPopover from "./components/HpPopover.vue";
import HpForm from "./components/HpForm.vue";
import HpFormItem from "./components/HpFormItem.vue";
import HpSelect from "./components/HpSelect.vue";

function registerComponents(app: VueApp<Element>) {
  app.component("HpInput", HpInput);
  app.component("HpButton", HpButton);
  app.component("HpUpload", HpUpload);
  app.component("HpDialog", HpDialog);
  app.component("HpPopover", HpPopover);
  app.component("HpForm", HpForm);
  app.component("HpFormItem", HpFormItem);
  app.component("HpSelect", HpSelect);
}

try {
  const app = createApp(App);
  registerComponents(app);
  app.use(router);

  if (document.getElementById("app")) {
    app.mount("#app");
  } else {
    console.error("Element #app not found, cannot mount the application.");
  }
} catch (error) {
  console.error("An error occurred while initializing the Vue app:", error);
}
