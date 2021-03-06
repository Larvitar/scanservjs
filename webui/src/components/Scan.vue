<template>
  <div>
    <v-row>
      <v-spacer/>

      <v-col cols="12" md="3" lg="auto" class="mb-10">
        <v-select v-if="context.devices.length > 0"
          label="Device" v-model="device"
          :items="context.devices" return-object item-text="id" @change="clear"></v-select>

        <v-select v-if="'--source' in device.features"
          label="Source" v-model="request.params.source"
          :items="device.features['--source']['options']"></v-select>

        <v-select
          label="Resolution" v-model="request.params.resolution"
          :items="device.features['--resolution']['options']"></v-select>

        <v-select
          label="Mode" v-model="request.params.mode"
          :items="device.features['--mode']['options']"></v-select>

        <v-select v-if="'--disable-dynamic-lineart' in device.features"
          label="Dynamic Lineart" v-model="request.params.mode"
          :items="[
            { key: false, value: 'Disabled' },
            { key: true, value: 'Enabled' }]"
          item-value="key" item-text="value"></v-select>

        <v-select label="Batch" v-model="request.batch"
          :items="[
            { key: 'none', value: 'None' },
            { key: 'manual', value: 'Manual (with prompt)' },
            { key: 'auto', value: 'Auto (Document feeder)' },
            { key: 'auto-collate', value: 'Auto (Duplex 1, 3... 2, 4)' }
          ]"
          item-value="key" item-text="value"></v-select>

        <v-select
          label="Format" v-model="request.pipeline"
          :items="context.pipelines"
          item-text="description"></v-select>

        <div class="d-flex flex-row-reverse flex-wrap">
          <v-btn color="green" @click="createPreview" class="ml-1 mb-1">preview <v-icon class="ml-2">mdi-magnify</v-icon></v-btn>
          <v-btn color="primary" @click="scan(1)" class="ml-1 mb-1">scan <v-icon class="ml-2">mdi-camera</v-icon></v-btn>
          <v-btn color="secondary" @click="reset" class="ml-1 mb-1">reset <v-icon class="ml-2">mdi-refresh</v-icon></v-btn>
        </div>
      </v-col>

      <v-col cols="12" md="6" lg="auto" class="mb-10" :style="{width: `${preview.width}px`}">
        <cropper ref="cropper" class="cropper" :key="preview.key" :transitionTime="10" :wheelResize="false"
            :default-position="cropperDefaultPosition" :default-size="cropperDefaultSize"
            :src="img" @change="onCrop"></cropper>
      </v-col>

      <v-col cols="12" md="3" lg="auto" class="mb-10">
        <v-text-field label="Top" type="number" v-model="request.params.top"  @change="onCoordinatesChange" />
        <v-text-field label="Left" type="number" v-model="request.params.left"  @change="onCoordinatesChange" />
        <v-text-field label="Width" type="number" v-model="request.params.width"  @change="onCoordinatesChange" />
        <v-text-field label="Height" type="number" v-model="request.params.height"  @change="onCoordinatesChange" />

        <div v-if="'--brightness' in device.features">
          <v-slider class="align-center" v-model="request.params.brightness"
            :step="device.features['--brightness']['interval']"
            :min="device.features['--brightness']['limits'][0]"
            :max="device.features['--brightness']['limits'][1]">
            <template v-slot:prepend>
              <v-text-field label="Brightness" 
                style="width: 60px" type="number" v-model="request.params.brightness" />
            </template>
          </v-slider>
        </div>

        <div v-if="'--contrast' in device.features">
          <v-slider class="align-center" v-model="request.params.contrast"
            :step="device.features['--contrast']['interval']"
            :min="device.features['--contrast']['limits'][0]"
            :max="device.features['--contrast']['limits'][1]">
            <template v-slot:prepend>
              <v-text-field label="Contrast" 
                style="width: 60px" type="number" v-model="request.params.contrast" />
            </template>
          </v-slider>
        </div>
      </v-col>
      
      <v-spacer/>
    </v-row>

    <batch-dialog ref="batchDialog" />
  </div>
</template>

<script>
import { Cropper } from 'vue-advanced-cropper';
import BatchDialog from './BatchDialog';

import Common from '../classes/common';
import Device from '../classes/device';
import Request from '../classes/request';
import Storage from '../classes/storage';

const storage = Storage.instance();

/**
 * @param {number} n 
 * @returns {number}
 */
function round(n) {
  return Math.round(n);
}

export default {
  name: 'Scan',
  components: {
    Cropper,
    BatchDialog
  },

  data() {
    const device = Device.default();
    const request = Request.create(null, device, '');

    return {
      context: {
        devices: [
          device
        ],
        pipelines: [],
        version: '0'
      },
      device: device,
      img: null,
      request: request,
      preview: {
        timer: 0,
        width: 400,
        key: 0
      }
    };
  },

  mounted() {
    this._resizePreview();
    this.readContext().then(() => {
      this.readPreview();
    });
    window.addEventListener('resize', () => {
      clearTimeout(this.preview.timer);
      this.preview.timer = setTimeout(this._resizePreview, 100);
    });
  },

  watch: {
    request: {
      handler(request) {
        storage.request = request;
        console.log('save:', storage.request);
        this.onCoordinatesChange();
      },
      deep: true
    }
  },

  methods: {
    _resizePreview() {
      const paperRatio = this.device.features['-x'].limits[1] / 
        this.device.features['-y'].limits[1];

      const smallBreakpoint = 576;
      const scrollbarWidth = 25;
      const appbarHeight = 120;

      if (window.innerWidth < smallBreakpoint) {
        this.preview.width = window.innerWidth - (window.scrollbars.visible ? scrollbarWidth : 0) - 30;
      } else {
        this.preview.width = (window.innerHeight - appbarHeight) * paperRatio;
      }
      this.preview.key += 1;
    },

    _fetch(url, options) {
      return Common.fetch(url, options)
        .catch(error => {
          this.notify({ type: 'e', message: error });
          this.mask(-1);
        });
    },

    createPreview() {
      this.mask(1);

      // Keep reloading the preview image
      const timer = window.setInterval(this.readPreview, 1000);

      let data = Common.clone(this.request);

      this._fetch('preview', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }).then(() => {
        window.clearInterval(timer);

        // Some scanners don't create the preview until after the scan has finished.
        // Run preview one last time
        window.setTimeout(this.readPreview, 1000);
        this.mask(-1);
      });
    },

    cropperDefaultPosition() {
      const adjust = (n) => round(n * this.pixelsPerMm());
      return {
        left: adjust(this.request.params.left),
        top: adjust(this.request.params.top)
      };
    },

    cropperDefaultSize() {
      const adjust = (n) => round(n * this.pixelsPerMm());
      return {
        width: adjust(this.request.params.width),
        height: adjust(this.request.params.height)
      };
    },

    mask(add) {
      this.$emit('mask', add);
    },

    notify(notification) {
      this.$emit('notify', notification);
    },

    onCoordinatesChange() {
      const adjust = (n) => round(n * this.pixelsPerMm());
      const params = this.request.params;
      const adjusted = {
        width: adjust(params.width),
        height: adjust(params.height),
        left: adjust(params.left),
        top: adjust(params.top)
      };
      this.$refs.cropper.setCoordinates(adjusted);
    },

    onCrop({coordinates}) {
      const adjust = (n) => round(n / this.pixelsPerMm());
      const params = this.request.params;
      params.width = adjust(coordinates.width);
      params.height = adjust(coordinates.height);
      params.left = adjust(coordinates.left);
      params.top = adjust(coordinates.top);
    },

    pixelsPerMm() {
      const scanner = {
        width: this.device.features['-x'].limits[1],
        height: this.device.features['-y'].limits[1]
      };

      const image = this.$refs.cropper.imageSize;
      return image.height / scanner.height;
    },

    readContext(force) {
      this.mask(1);
      const url = 'context' + (force ? '/force' : '');
      this.notify({ type: 'i', message: 'Finding devices...' });

      return this._fetch(url).then(context => {
        this.context = context;

        if (context.devices.length > 0) {
          for (let device of context.devices) {
            this.notify({ type: 'i', message: `Found device ${device.id}`});
          }
          this.device = context.devices[0];
          this.request = this.buildRequest();
          for (let test of context.diagnostics) {
            this.notify({ type: test.success ? 's' : 'e', message: test.message });
          }
        } else {
          this.notify({ type: 'e', message: 'Found no devices' });
        }

        if (force) {
          this.clear();
          this.readPreview();
        }
        this.mask(-1);
      });
    },

    readPreview() {
      // Gets the preview image as a base64 encoded jpg and updates the UI
      this._fetch('preview', {
        cache: 'no-store',
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }).then(data => {
        this.img = 'data:image/jpeg;base64,' + data.content;
      });
    },

    buildRequest() {
      let request = storage.request;
      if (request !== null) {
        this.device = this.context.devices.filter(d => d.id === request.params.deviceId)[0]
          || this.context.devices[0];
      }

      request = Request.create(request, this.device, this.context.pipelines[0].description);
      return request;
    },

    reset() {
      this.readContext(true);
    },

    clear() {
      storage.request = null;
      this.request = this.buildRequest();
    },

    scan(index) {
      this.mask(1);
      if (index !== undefined) {
        this.request.index = index;
      }
      let data = Common.clone(this.request);
      
      this._fetch('scan', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }).then((response) => {
        if (response && 'index' in response) {
          const options = {
            message: 'Turn documents over',
            onFinish: () => {
              this.request.index = -1;
              this.scan();
            },
            onNext: () => {
              this.request.index = response.index + 1;
              this.scan();
            }
          };
          if (response.image) {
            options.message = `Preview of page ${response.index}`;
            options.image = response.image;
            options.onRescan = () => {
              this.request.index = response.index;
              this.scan();
            };
          }
          this.$refs.batchDialog.open(options);
        } else {
          // Finish
          this.$router.push('/files');
        }
        this.mask(-1);
      });
    }
  }
};
</script>

<style scoped>
#mask {
  position: fixed;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,.4);
  top: 0;
  left: 0;
  z-index: 10;
}
</style>