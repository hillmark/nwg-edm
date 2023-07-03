import "leaflet/dist/leaflet.css";

import Papa from "papaparse";
import * as L from "leaflet";
import HeatmapOverlay from "heatmap.js/plugins/leaflet-heatmap";
import csvString from "./2022data.txt"; // https://www.doogal.co.uk/BatchReverseGeocoding

// 2022 headers
const headers = [
  "Water Company Name",
  "Site Name\n(EA Consents Database)",
  "Site Name\n(WaSC operational)\n[optional]",
  "EA Permit Reference\n(EA Consents Database)",
  "WaSC Supplementary Permit Ref.\n[optional]",
  "Activity Reference on Permit",
  "Storm Discharge Asset Type",
  "Outlet Discharge NGR\n(EA Consents Database)",
  "WFD Waterbody ID (Cycle 2)\n(discharge outlet)",
  "WFD Waterbody Catchment Name (Cycle 2)\n(discharge outlet)",
  "Receiving Water / Environment (common name)\n(EA Consents Database)",
  "Shellfish Water (only populate for storm overflow with a Shellfish Water EDM requirement)",
  "Bathing Water (only populate for storm overflow with a Bathing Water EDM requirement)",
  "Treatment Method\n(over & above Storm Tank settlement / screening)",
  "Initial EDM Commission Date",
  "Total Duration (hrs) all spills prior to processing through 12-24h count method",
  "Counted spills using 12-24h count method",
  "Long-term average spill count",
  "No. full years EDM data\n(years)",
  "EDM Operation -\n% of reporting period EDM operational",
  "EDM Operation -\nReporting % -\nPrimary Reason <90%",
  "EDM Operation -\nAction taken / planned -\nStatus & timeframe",
  "High Spill Frequency -\nOperational Review -\nPrimary Reason",
  "High Spill Frequency -\nAction taken / planned -\nStatus & timeframe",
  "High Spill Frequency -\nEnvironmental Enhancement -\nPlanning Position (Hydraulic capacity)",
  "",
  "Grid reference",
  "Latitude",
  "Longitude",
];

// const scale = (number, inMin, inMax, outMin, outMax) =>
//   ((number - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;

function scale(value, inputRange, outputRange) {
  const [inputMin, inputMax] = inputRange;
  const [outputMin, outputMax] = outputRange;

  // Clamp the value to the input range
  const clampedValue = Math.max(Math.min(value, inputMax), inputMin);

  // Map the clamped value to the output range
  const scaledValue =
    ((clampedValue - inputMin) / (inputMax - inputMin)) *
      (outputMax - outputMin) +
    outputMin;

  return scaledValue;
}

function normalize(data) {
  const mean = calculateMean(data);
  const stdDev = calculateStandardDeviation(data, mean);
  const normalizedData = data.map((value) => (value - mean) / stdDev);
  return normalizedData;
}

function calculateMean(data) {
  const sum = data.reduce((acc, value) => acc + value, 0);
  return sum / data.length;
}

function calculateStandardDeviation(data, mean) {
  const squaredDifferences = data.map((value) => Math.pow(value - mean, 2));
  const variance =
    squaredDifferences.reduce((acc, value) => acc + value, 0) / data.length;
  return Math.sqrt(variance);
}

const csv = Papa.parse(csvString, {
  header: true,
  delimiter: ",",
  quoteChar: '"',
  transformHeader: (header, index) => {
    switch (index) {
      case 1:
        return "site_name";
      case 6:
        return "asset_type";
      case 10:
        return "receiving_water";
      case 15:
        return "spills_duration";
      case 16:
        return "spills_count";
      case 19:
        return "monitoring";
      case 27:
        return "lat";
      case 28:
        return "lng";
      default:
        return header;
    }
  },
});

csv.data.forEach((row) => {
  row.spills_duration = +row.spills_duration;
  row.spills_count = isNaN(row.spills_count) ? 0 : +row.spills_count;
  row.lat = +row.lat;
  row.lng = +row.lng;
  row.monitoring = +row.monitoring.replace("%", "");
});

const total = csv.data.reduce(
  (sum, row) => [sum[0] + row.lat, sum[1] + row.lng],
  [0, 0]
);

const center = [total[0] / csv.data.length, total[1] / csv.data.length];
const maxDuration = Math.max(...csv.data.map((x) => x.spills_duration));

const map = L.map("map", {
  center,
  zoom: 8,
  layers: [],
});

const streetmap = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }
).addTo(map);

const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  }
);

const createSvg = (path, size) => {
  return `<svg
    width=${size}
    height=${size}
    viewBox="0 0 100 100"
    version="1.1"
    preserveAspectRatio="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    ${path}
  </svg>`;
};

const createShape = (name, size, fill = "#f00", opacity = 1.0) => {
  switch (name) {
    case "circle":
      return createSvg(
        `<circle cx="50" cy="50" r="50" fill-opacity="${opacity}" fill=${fill}></circle>`,
        size
      );
    case "down":
      return createSvg(
        `<path d="M0 0 L50 100 L100 0 Z" fill-opacity="${opacity}" fill=${fill}></path>`,
        size
      );
    case "rect":
      return createSvg(
        `<rect width="100" height="100" fill-opacity="${opacity}" fill=${fill}></rect>`,
        size
      );
    case "up":
      return createSvg(
        `<path d="M50 0 L0 100 L100 100 Z" fill-opacity="${opacity}" fill=${fill}></path>`,
        size
      );
    default:
      break;
  }
};

const svgIcon = (name, size, color, opacity = 1.0) =>
  L.divIcon({
    html: createShape(name, size, color, opacity),
    className: "svg-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const popup = (row) => `
  <div class="popup">
    <p><b>Site Name:</b> ${row.site_name}
    <p><b>Receiving Water:</b> ${row.receiving_water}
    <p><b>Spills duration (hrs):</b> ${row.spills_duration}
    <p><b>Spills count:</b> ${row.spills_count}
    <p><b>Monitoring:</b> ${row.monitoring}%
    <p><b>Asset Type:</b> ${row.asset_type}
  </div>
`;

const layerGroup = new L.LayerGroup().addTo(map);

const assetShapePrefixMap = {
  "Inlet SO": "circle",
  "SO on sewer network": "down",
  "Storm discharge": "rect",
  "Storm tank": "up",
};

const normalizedSpills = normalize(csv.data.map((d) => d.spills_duration));
const normalMin = Math.min(...normalizedSpills);
const normalMax = Math.max(...normalizedSpills);

const markers = csv.data.map((row, index) => {
  let color = "#04A40B";
  if (row.monitoring > 50 && row.monitoring < 90) {
    color = "#FF5F1F";
  } else if (row.monitoring < 50) {
    color = "#f00";
  }
  const size = scale(normalizedSpills[index], [normalMin, normalMax], [15, 35]);

  const key = Object.keys(assetShapePrefixMap).filter((k) =>
    row.asset_type.startsWith(k)
  );
  const shape = assetShapePrefixMap[key] ?? "circle";

  return L.marker([row.lat, row.lng], {
    icon: svgIcon(shape, size, color, 0.85),
  })
    .bindPopup(popup(row))
    .addTo(layerGroup);
});

const heatmapLayer = new HeatmapOverlay({
  radius: 0.05,
  maxOpacity: 0.65,
  blur: 0.85,
  scaleRadius: true,
  useLocalExtrema: true,
  latField: "lat",
  lngField: "lng",
  valueField: "spills_duration",
});

heatmapLayer.setData({ max: maxDuration, data: csv.data });

const basemaps = {
  Street: streetmap,
  Satelite: satellite,
};

const overlaymaps = {
  Markers: layerGroup,
  Heat: heatmapLayer,
};

L.control.layers(basemaps, overlaymaps).addTo(map);
