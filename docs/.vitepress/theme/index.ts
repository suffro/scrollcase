import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { h, nextTick, watch } from 'vue'
import { createMermaidRenderer } from 'vitepress-mermaid-renderer'
import 'vitepress-mermaid-renderer/css'
import HomePage from './HomePage.vue'
import Tabs from './tabs-component/Tabs.vue'
import Tab from './tabs-component/Tab.vue'
import Button from './Button.vue'
import Spacer from './Spacer.vue'
import SubPagesList from './SubPagesList.vue'
import VersionSwitch from './VersionSwitch.vue'
import DeprecationNotice from './DeprecationNotice.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  // Wrap the default layout so ```mermaid fences become interactive diagrams
  // that follow the active colour scheme.
  Layout() {
    const { isDark } = useData()

    const initMermaid = () =>
      createMermaidRenderer({ theme: isDark.value ? 'dark' : 'default' })

    nextTick(() => initMermaid())
    watch(() => isDark.value, () => initMermaid())

    // The version switch goes in both navbars, not one: the wide layout's menu is replaced by the
    // hamburger screen below 768px, and a control that exists on a desktop and vanishes on a phone
    // is how a reader gets stranded in the deprecated documentation.
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(VersionSwitch),
      'nav-screen-content-after': () => h(VersionSwitch),
      // Declared for every page; the component shows itself only under `/v2/`. Registering it here
      // rather than writing a block into each deprecated page is what makes it impossible to forget
      // on one, and what keeps the copied pages byte-identical to what version 2 published.
      'doc-before': () => h(DeprecationNotice),
    })
  },
  enhanceApp({ app }) {
    app.component('HomePage', HomePage),
    app.component('SubPagesList', SubPagesList)
    app.component('Tabs', Tabs),
    app.component('Tab', Tab)
    app.component('Button', Button)
    app.component('Spacer', Spacer)
  },
}
