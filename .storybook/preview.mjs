import "../app.css";
import "../stories/workbench.css";

export default {
  globalTypes: {
    theme: {
      description: "GameVault color theme",
      defaultValue: "dark",
      toolbar: {
        icon: "paintbrush",
        items: [
          {value: "dark", title: "Dark"},
          {value: "light", title: "Light"}
        ]
      }
    }
  },
  decorators: [
    (Story, context) => {
      document.documentElement.classList.toggle("light", context.globals.theme === "light");
      document.documentElement.style.colorScheme = context.globals.theme === "light" ? "light" : "dark";
      return Story();
    }
  ],
  parameters: {
    layout: "fullscreen",
    controls: {expanded: true},
    a11y: {
      test: "error"
    }
  }
};
