const ipcRenderer = require('electron').ipcRenderer;
const {dialog} = require('electron').remote;
const defaultBorder = ".4"  //This was the hardcoded default pre-2.0.0-beta-03
let selectedLocalPrinter;	
let almaPrinterProfiles;
let displayName;
let globalAlmaPrinters;
let availableAlmaPrinters = [];
let cancelAvailable = false;

const form = document.querySelector('form');
form.addEventListener('submit', submitForm);

//Handle saving of updated alma print daemon settings
function submitForm(e){
	//document.getElementById("message").value = 'In submitForm';
	e.preventDefault();
	let badInterval = false;
	let interval = 0;
	let orientation;
	let color;
	const region = document.querySelector('#region').value;
	const apiKey = document.querySelector('#apiKey').value;
	const autoStart = document.getElementById('autostart');

	//Set interval based on which method radio button selected:  automatic or manual
	if (document.querySelector('input[name="method"]:checked').value == "manual") {
		interval = 0;
	}
	else {
		interval = document.querySelector('#interval').value;
		if (interval <= 0) {
			badInterval = true;
		}
	}

	if (apiKey.length == 0) {
		alert ('An API key must be supplied.');
		document.getElementById("apiKey").focus();
		return false;
	}

	if (badInterval) {
		alert ('The interval must be greater than 0.');
		document.getElementById("interval").focus();
		return false;
	}

	if (almaPrinterProfiles.length == 0) {
		alert ('At least one Alma Printer Profile must be defined.')
		return false;
	}
	//If all required config values entered, it is ok to save.
	if (apiKey.length  && !badInterval && almaPrinterProfiles.length > 0) {

		var configString = "{\"region\": \"" + region + "\",";
		configString = configString + "\"apiKey\": \"" + apiKey + "\",";
		configString = configString + "\"interval\": \"" + interval + "\",";
		configString = configString + "\"autoStart\": \"" + autoStart.checked + "\",";
		configString = configString + "\"almaPrinterProfiles\":";
		configString = configString + JSON.stringify(almaPrinterProfiles);
		configString = configString + "}";
		//document.getElementById("message").value = 'Send save-settings:  ' + configString;
		ipcRenderer.send('save-settings', configString);
	}
	else {
		alert ("Required configuration settings missing!");
		document.getElementById("apiKey").focus();
		return false;
	}
}

//Handle loading of alma print daemon settings
ipcRenderer.on('send-settings', (event, configSettings) => {
	//document.getElementById("message").value = 'In send-settings';
	let element = document.getElementById('region');
	element.value = configSettings.region;
	document.getElementById('apiKey').value = configSettings.apiKey;

	if (configSettings.interval > 0) {
		document.getElementById('interval').value = configSettings.interval;
		document.getElementById('methoda').checked = true;
		disableAutomaticOptions(false);
		if (configSettings.autoStart == "true") {
			document.getElementById('autostart').checked = true;
		}
	}
	else {
		document.getElementById('methodm').checked = true;
		disableAutomaticOptions(true);
	}
	almaPrinterProfiles = configSettings.almaPrinterProfiles;
})

//Handle loading local workstation printers
ipcRenderer.on('local-printers', (event, localPrinters) => {
	//document.getElementById("message").value = 'In local-printers';
	let i = 0;
	var sel = document.getElementById('localPrinter');
	console.log ('local-printers selectedLocalPrinter = ' + selectedLocalPrinter);
	while (i < localPrinters.length) {
		var opt = document.createElement('option');
		//Indicate if the printer is the default printer for the workstation
		if (localPrinters[i].isDefault) {
			opt.appendChild(document.createTextNode(localPrinters[i].name + ' (workstation default printer)'));			
		}
		else {
			opt.appendChild(document.createTextNode(localPrinters[i].name));
		}
		opt.value = localPrinters[i].name;
		if (localPrinters[i].name == selectedLocalPrinter) {
			opt.selected = true;
		}
		else {
			opt.selected = false;
		}
		sel.appendChild(opt);
		i++;
	}
})

//Handle loading Alma printers
ipcRenderer.on('alma-printers', (event, almaPrinters) => {
	//document.getElementById("message").value = 'In Renderer load Alma printers ' + JSON.stringify(almaPrinters);
	if (document.getElementById('apiKey').value.length > 0) {
		globalAlmaPrinters = almaPrinters;
		almaPrintersAvailable();
		loadAvailableAlmaPrinters();
		appendPrinterProfiles(almaPrinters, almaPrinterProfiles);
		//Set add/remove printer profile button state
		setRemovePrinterProfileButtonState();
		setAddPrinterProfileButtonState();
	}
	if (document.getElementById('apiKey').value.length == 0 || almaPrinterProfiles.length == 0) {
		document.getElementById("cancelSettings").disabled = true;
	}
})

//Function that communicates with Alma to get the Alma printers.
function getAlmaPrinters() {
    console.log ('in getAlmaPrinters()');
	//document.getElementById("message").value = 'In getAlmaPrinters';
	const region = document.querySelector('#region').value;
	const apiKey = document.querySelector('#apiKey').value;
	const https = require('https');
	let data = '';

	let request = "https://api-" + region + ".hosted.exlibrisgroup.com/almaws/v1/conf/printers?apikey=" + apiKey  + '&printout_queue=true&limit=100&format=json';
	console.log ("request = " + request);
	//document.getElementById("message").value = request;
	https.get(
	  request, (resp) =>{
		// A chunk of data has been received.
		resp.on('data', (chunk) =>{
		  data += chunk;
		});
		// Response has ended.
		resp.on('end', () =>{
     	  console.log("get request response done!");
		  console.log("response = " + data);
		  if (data.substring(0, 5) == "<?xml") {
			console.log("xml response = " + data);
			let errorsExist = data.indexOf("<errorsExist>true</errorsExist>");
			if (errorsExist != -1) {
			  console.log ("Error in request");
			  let startErrorMessage = data.indexOf("<errorMessage>") + 14;
			  let endErrorMessage = data.indexOf("</errorMessage>");
			  let errorMessage = data.substring(startErrorMessage, endErrorMessage);
			  console.log ("Error message = " + errorMessage);
			  alert(errorMessage);
			  return;
			}
		  }
		  if (data.length == 0) {
			console.log ("No alma printers data received...");
			return;
          }
		  almaPrinters = JSON.parse(data);
		  globalAlmaPrinters = almaPrinters;
          const options = {
            buttons: ['Close'],
            title: 'Success!',
            message: 'Your API key is valid.',
          }
		  let response = dialog.showMessageBox(options);
		  almaPrintersAvailable();
		  loadAvailableAlmaPrinters();
		  appendPrinterProfiles(almaPrinters, almaPrinterProfiles);
		  //Set add/remove printer profile button state
		  setRemovePrinterProfileButtonState();
		  setAddPrinterProfileButtonState();
		})
	  }).on('error', (e) => {
		const options = {
		  type: 'error',
		  buttons: ['Close'],
		  title: 'Communication Error',
		  message: 'An error occurred requesting available Alma Printers. Please check your Alma Print Daemon configuration settings and try again.',
		  detail: JSON.stringify(e)
		}
		dialog.showMessageBox(options, (response) => {
		  console.log('The response is ' + response);
		})
	  })
}

function loadAlmaPrinters(almaPrinters) {
    let i;
	//If no printers, go back
	if (almaPrinters == null) {
		alert ('There are no Alma Printer Queues defined for the supplied API key.');
		return;
	}
	//Load Alma printer queue printers into the selection list
	var sel = document.getElementById('almaPrinter');

	const printersDefined = almaPrinters.total_record_count;
	if (printersDefined == 0) {
		alert ('There are no Alma printout queues for the supplied API key.');
		return;
	}
	console.log ("Parsed Alma printers JSON.  Number of printers = " + printersDefined);
	let displayName;
	for (i = 0; i < printersDefined; i++) {
	  if (almaPrinters.printer[i].description !== null) {
		displayName = almaPrinters.printer[i].name + " - " + almaPrinters.printer[i].description;
	  }
	  else {
		displayName = almaPrinters.printer[i].name;
	  }
	  var opt = document.createElement('option');
	  opt.appendChild(document.createTextNode(displayName));
	  opt.value = almaPrinters.printer[i].id;
	  sel.appendChild(opt);
	}
}

function loadAvailableAlmaPrinters() {
	let availablePrinter;
	removeAvailablePrinters();
	if (availableAlmaPrinters.length) {
		var sel = document.getElementById('almaPrinter');	
		let displayName;
		for (let i = 0; i < availableAlmaPrinters.length; i++) {
			availablePrinter = JSON.parse(JSON.stringify(availableAlmaPrinters[i]));
			if (availablePrinter.description !== null) {
				displayName = availablePrinter.name + " - " + availablePrinter.description;
		  	}
		  	else {
				displayName = availablePrinter.name;
			}

		  	var opt = document.createElement('option');
		  	opt.appendChild(document.createTextNode(displayName));
		  	opt.value = availablePrinter.id;
			sel.appendChild(opt);
		}	
	}
}

function showPrinterProfiles () {
	//Swap UI elements
	document.getElementById('newPrinterProfile').style.display = 'none';
	document.getElementById('profilelist').style.display = 'block';
	enableDisableSettings("settings", false); 
}

function savePrinterProfile () {
	//Build JSON element
	var jsonObj;
	var orientationValue;
	var colorValue;

	const localPrinterSelected = encodeURIComponent(document.querySelector('#localPrinter').value);

	if (document.querySelector('input[name="orientation"]:checked').value == "portrait") {
		orientationValue = 'portrait';
	}
	else {
		orientationValue = 'landscape';
	}
	if (document.querySelector('input[name="color"]:checked').value == "true") {
		colorValue = 'true';
	}
	else {
		colorValue = 'false';
	}
	
	const format = document.querySelector('#letterFormat').value;
	const units = document.querySelector('#borderUnits').value;
	const top = document.querySelector('#borderTop').value;
	const right = document.querySelector('#borderRight').value;
	const bottom = document.querySelector('#borderBottom').value;
	const left = document.querySelector('#borderLeft').value;

	var x = document.getElementById("almaPrinter");
	for (var i = 0; i < x.options.length; i++) {
		if (x.options[i].selected) {
			jsonObj = {almaPrinter: x.options[i].value, localPrinter: localPrinterSelected, orientation: orientationValue, color: colorValue, letterFormat: format, borderUnits: units, borderTop: top, borderRight: right, borderBottom: bottom, borderLeft: left};
			almaPrinterProfiles.splice(almaPrinterProfiles.length, 0, jsonObj);
		}
	}
	updatePrinterSettings();
	//Swap UI elements
	showPrinterProfiles();
}

function addPrinterProfile () {
	document.getElementById('newPrinterProfile').style.display = 'block';
	document.getElementById('profilelist').style.display = 'none';
	enableDisableSettings("settings", true);
	// clear Alma printer selection
	var sel = document.getElementById('almaPrinter');
	sel.selectedIndex = -1;
	// make ok button disabled
	document.getElementById("addOK").disabled = true;
}

function removePrinterProfile() {
	var checkedBoxes = document.querySelectorAll('input[id=printerProfile]:checked');
	for (var i = checkedBoxes.length - 1; i >= 0; i--) {
		almaPrinterProfiles.splice(checkedBoxes[i].value, 1);
	}	
	updatePrinterSettings();
}

function removeAvailablePrinters() {
	var x = document.getElementById("almaPrinter");
	x.options.length = 0;
}

function appendPrinterProfiles(almaPrinters, data) {
	var myObj = document.getElementById('profiles');
	if (myObj !== null)
		myObj.remove();
	var mainContainer = document.getElementById("printerProfiles");
	var div = document.createElement('div');
	var letterFormat, borderUnits, borderTop, borderRight, borderBottom, borderLeft;
	div.id = 'profiles'
	mainContainer.appendChild(div);
	var secondContainer = document.getElementById('profiles');
    for (var i = 0; i < data.length; i++) {
		if (buildAlmaPrinterDisplayName (almaPrinters, data[i].almaPrinter)) {
			var div = document.createElement('div');
			if (i == 0) {
				div.innerHTML = '';
			}
			else {
				div.innerHTML = '<hr>';			
			}
			if (data[i].letterFormat == undefined)
			  letterFormat = 'Letter'
			else 
			  letterFormat = data[i].letterFormat;
			if (data[i].borderUnits == undefined) 
			  borderUnits = "in";
			else 
			  borderUnits = data[i].borderUnits;
			borderTop = setBorderValue(data[i].borderTop);
			borderRight = setBorderValue(data[i].borderRight)
			borderBottom = setBorderValue(data[i].borderBottom);
			borderLeft = setBorderValue(data[i].borderLeft);
			div.innerHTML = div.innerHTML + '<input type="checkbox" id="printerProfile" onclick="javascript:setRemovePrinterProfileButtonState();" value="' + i + '">';
			div.innerHTML = div.innerHTML + 'Alma Printer:  ' + displayName + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Local Printer:  ' + decodeURIComponent(data[i].localPrinter ) + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Orientation:  ' + data[i].orientation + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Color:  ' + data[i].color + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Format:  ' + letterFormat + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Border (' + borderUnits + '): top ' + borderTop + ', right ' + borderRight + ', bottom ' + borderBottom + ', left ' + borderLeft + '<br>';
			secondContainer.appendChild(div);
		}	
	}

}

function setAddPrinterProfileButtonState () {
	var x = document.getElementById("almaPrinter");
	if (x.options.length == 0) {
		document.getElementById("addPrinterProfileButton").disabled = true;
	}
	else {
		document.getElementById("addPrinterProfileButton").disabled = false;		
	}
}

function setRemovePrinterProfileButtonState () {
	var checkedBoxes = document.querySelectorAll('input[id=printerProfile]:checked');
	if (checkedBoxes.length == 0) {
		document.getElementById("removePrinterProfileButton").disabled = true;
	}
	else {
		document.getElementById("removePrinterProfileButton").disabled = false;		
	}
}

function setAddOKButtonState () {
	if (document.getElementById('almaPrinter').selectedIndex == -1 || document.getElementById('localPrinter').selectedIndex == -1) {
		document.getElementById("addOK").disabled = true;
	}
	else {
		document.getElementById("addOK").disabled = false;		
	}
}

function buildAlmaPrinterDisplayName(almaPrinters, id) {
	//let printerCount = almaPrinters.total_record_count;
	let printerCount = almaPrinters.printer.length;
	for (let i = 0; i < printerCount; i++) {
		if (almaPrinters.printer[i].id == id) {
			displayName = almaPrinters.printer[i].name
			if (almaPrinters.printer[i].description != null) {
				displayName = displayName + " - " + almaPrinters.printer[i].description;
			};
		    return true;
 		}
	}
	return false;
}

function almaPrintersAvailable() {
	//let printerCount = globalAlmaPrinters.total_record_count;
	let printerCount = globalAlmaPrinters.printer.length;
	let inUse;
	let iCount = 0;
	let i;
	let j;
	availableAlmaPrinters = [];
	for (i = 0; i < printerCount; i++) {
		inUse = false;
		for (j = 0; j < almaPrinterProfiles.length; j++) {
			if (globalAlmaPrinters.printer[i].id == almaPrinterProfiles[j].almaPrinter) {
				inUse = true;
				iCount++;
				break;
			}
		}
		if (!inUse) {
			availableAlmaPrinters.push (JSON.parse(JSON.stringify(globalAlmaPrinters.printer[i])));
		}
	}
}

function updatePrinterSettings () {
	//Remove the current printer profiles....
	var myObj = document.getElementById('profiles');
	if (myObj !== null)
	  myObj.remove();
	//Rebuild available Alma printers and reload them
	almaPrintersAvailable();
	loadAvailableAlmaPrinters();
	//Reload printer profiles 
	appendPrinterProfiles (globalAlmaPrinters, almaPrinterProfiles);
	//Set add/remove printer profile button state
	setRemovePrinterProfileButtonState();
	setAddPrinterProfileButtonState();
}

function testAPIKey () {
	//document.getElementById("message").value = 'In testAPIKey';
	getAlmaPrinters();
}

function enableDisableSettings (divId, value) {
// This will disable all the children of the div
	var nodes = document.getElementById(divId).getElementsByTagName('*');
	for(var i = 0; i < nodes.length; i++){
     	nodes[i].disabled = value;
	}
}

function disableAutomaticOptions(value) {
	document.getElementById("interval").disabled = value;
	document.getElementById("autostart").disabled = value;
}

function resumePrinting(){
	//document.getElementById("message").value = 'in resumePrinting';	
	ipcRenderer.send('print-continue');
}

function setBorderValue (value) {
	if (value == undefined)
	  return defaultBorder;
	else if (value == "")
	  return "0";
	else if (isNaN(value))
	  return "0";
	else
	  return value;
}