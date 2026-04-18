const viewerElement = document.getElementById("viewer");
const inputElement = document.getElementById("stlInput");
const openFileButton = document.getElementById("openFileButton");
const resetViewButton = document.getElementById("resetViewButton");
const clearMeasureButton = document.getElementById("clearMeasureButton");
const newLineButton = document.getElementById("newLineButton");
const addFittingButton = document.getElementById("addFittingButton");
const lineListElement = document.getElementById("lineList");
const fittingListElement = document.getElementById("fittingList");
const contextMenu = document.getElementById("contextMenu");
const contextNewLineButton = document.getElementById("contextNewLine");
const contextDeleteLineButton = document.getElementById("contextDeleteLine");
const lineTypePanel = document.getElementById("lineTypePanel");
const lineTypeOptions = document.getElementById("lineTypeOptions");
const lineTypeCancelButton = document.getElementById("lineTypeCancel");
const dropZone = document.getElementById("dropZone");
const statusText = document.getElementById("statusText");
const measurementLabel = document.getElementById("measurementLabel");

const requiredElements = [
  viewerElement,
  inputElement,
  openFileButton,
  resetViewButton,
  clearMeasureButton,
  newLineButton,
  addFittingButton,
  lineListElement,
  fittingListElement,
  contextMenu,
  contextNewLineButton,
  contextDeleteLineButton,
  lineTypePanel,
  lineTypeOptions,
  lineTypeCancelButton,
  dropZone,
  statusText,
  measurementLabel
];

if (requiredElements.some((element) => !element)) {
  throw new Error("Missing required UI elements.");
}

export {
  viewerElement,
  inputElement,
  openFileButton,
  resetViewButton,
  clearMeasureButton,
  newLineButton,
  addFittingButton,
  lineListElement,
  fittingListElement,
  contextMenu,
  contextNewLineButton,
  contextDeleteLineButton,
  lineTypePanel,
  lineTypeOptions,
  lineTypeCancelButton,
  dropZone,
  statusText,
  measurementLabel
};
