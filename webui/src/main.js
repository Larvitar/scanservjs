import Vue from 'vue';
import VueRouter from 'vue-router';
import App from './App.vue';

import Files from './components/Files.vue';
import Scan from './components/Scan.vue';
import Settings from './components/Settings.vue';
import About from './components/About.vue';

import vuetify from './plugins/vuetify';

import '@mdi/font/css/materialdesignicons.css';

Vue.config.productionTip = false;
Vue.use(VueRouter);

const router = new VueRouter({
  routes: [
    { path: '/about', component: About },
    { path: '/files', component: Files },
    { path: '/settings', component: Settings },
    { path: '/scan', component: Scan }
  ]
});

new Vue({
  vuetify,
  router,
  render: h => h(App)
}).$mount('#app');
