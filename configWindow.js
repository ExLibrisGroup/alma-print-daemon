var alma = require ('almarestapi-lib');
const ipcRenderer = require('electron').ipcRenderer;
const {dialog} = require('electron').remote;
const defaultBorder = ".4"  //This was the hardcoded default pre-2.0.0-beta-03
let selectedLocalPrinter;	
let almaPrinterProfiles;
let displayName;
let globalAlmaPrinters;
let availableAlmaPrinters = [];
let almaPrinters;
let cancelAvailable = false;
let editMode = false;

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
	var sel = document.getElementById('localPrinter');
	//Clear out the local printer dropdown before adding them
	let i, L = sel.options.length - 1;
	for(i = L; i >= 0; i--) {
	   sel.remove(i);
	}
 	//document.getElementById("message").value = 'In local-printers';
	i = 0;
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
		setEditPrinterProfileButtonState();
		setAddPrinterProfileButtonState();
	}
	if (document.getElementById('apiKey').value.length == 0 || almaPrinterProfiles.length == 0) {
		document.getElementById("cancelSettings").disabled = true;
	}
})


const getPrinterQueues = async (type, offset) => 
	await alma.getp(`/conf/printers?printout_queue=${type}&limit=100&offset=${offset}`);

const getAlmaPrinters = async () => {
	//Get Alma printers in groups to fix GitHub issue #35.
	let nextBatch;
	almaPrinters = await getPrinterQueues('true', 0);
	let total_alma_printers = almaPrinters.total_record_count;
	let current_printer_count = almaPrinters.printer.length;
	while (total_alma_printers > current_printer_count) {
	  nextBatch = await getPrinterQueues('true', current_printer_count);
	  for (const printer of nextBatch.printer) {
		almaPrinters.printer.splice(almaPrinters.printer.length, 0, printer);
	  }
	  current_printer_count = current_printer_count + nextBatch.printer.length;
	}
	globalAlmaPrinters = almaPrinters;
	almaPrintersAvailable();
	loadAvailableAlmaPrinters();
	appendPrinterProfiles(almaPrinters, almaPrinterProfiles);
	//Set add/remove printer profile button state
	setRemovePrinterProfileButtonState();
	setEditPrinterProfileButtonState();
	setAddPrinterProfileButtonState();
  }

//Function that communicates with Alma to test the API key, then get the Alma printers.
function testAPIKey() {
    console.log ('in getAlmaPrinters()');
	//document.getElementById("message").value = 'In getAlmaPrinters';
	const region = document.querySelector('#region').value;
	const apiKey = document.querySelector('#apiKey').value;
	const https = require('https');
	let data = '';

	let request = "https://api-" + region + ".hosted.exlibrisgroup.com/almaws/v1/conf/printers?apikey=" + apiKey  + '&printout_queue=true&limit=1&format=json';
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
		  //almaPrinters = JSON.parse(data);
		  //console.log ('data = ' + JSON.stringify(data));
		  const options = {
            buttons: ['Close'],
            title: 'Success!',
            message: 'Your API key is valid.',
          }
		  let response = dialog.showMessageBox(options);
		  process.env.ALMA_APIKEY = apiKey;
		  process.env.ALMA_APIPATH = 'https://api-' + region + '.hosted.exlibrisgroup.com/almaws/v1';
		  alma.setOptions (process.env.ALMA_APIKEY, process.env.ALMA_APIPATH);
		  getAlmaPrinters();
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

	const localPrinterSelected = encodeURIComponent(document.querySelector('#localPrinter').value);
	const orientationValue = document.querySelector('#orientationOption').value;
	const colorValue = document.querySelector('#colorOption').value;
	const format = document.querySelector('#letterFormat').value;
	const units = document.querySelector('#borderUnits').value;
	const top = document.querySelector('#borderTop').value;
	const right = document.querySelector('#borderRight').value;
	const bottom = document.querySelector('#borderBottom').value;
	const left = document.querySelector('#borderLeft').value;
	const customHeight = document.querySelector('#pageHeight').value;
	const customWidth = document.querySelector('#pageWidth').value;

	//if in edit mode, remove the existing entry and build new one
	if (editMode) {
		var checkedBoxes = document.querySelectorAll('input[id=printerProfile]:checked');
		for (var i = checkedBoxes.length - 1; i >= 0; i--) {
			almaPrinterProfiles.splice(checkedBoxes[i].value, 1);
		}
		jsonObj = {almaPrinter: document.querySelector('#almaPrinterId').value, localPrinter: localPrinterSelected, orientation: orientationValue, color: colorValue, letterFormat: format, borderUnits: units, borderTop: top, borderRight: right, borderBottom: bottom, borderLeft: left, pageHeight: customHeight, pageWidth: customWidth};
	} else {
		//we are adding; build new entries
		var x = document.getElementById("almaPrinter");
		for (var i = 0; i < x.options.length; i++) {
			console.log ("in the addloop");
			if (x.options[i].selected) {
				jsonObj = {almaPrinter: x.options[i].value, localPrinter: localPrinterSelected, orientation: orientationValue, color: colorValue, letterFormat: format, borderUnits: units, borderTop: top, borderRight: right, borderBottom: bottom, borderLeft: left, pageHeight: customHeight, pageWidth: customWidth};
			}
		}
	}	
	//insert new or edited entry
	almaPrinterProfiles.splice(almaPrinterProfiles.length, 0, jsonObj);
	updatePrinterSettings();
	//Swap UI elements
	showPrinterProfiles();
}

function addPrinterProfile () {
	document.getElementById('newPrinterProfile').style.display = 'block';
	document.getElementById('profilelist').style.display = 'none';
	document.getElementById('addPrinter').style.display = 'block';
	document.getElementById('editPrinter').style.display = 'none';
	enableDisableSettings("settings", true);
	// clear Alma printer selection
	var sel = document.getElementById('almaPrinter');
	sel.selectedIndex = -1;
	// make ok button disabled
	document.getElementById("addOK").disabled = true;
	editMode = false;
}

function editPrinterProfile () {
	console.log ("In editPrinterProfile");
	document.getElementById('newPrinterProfile').style.display = 'block';
	document.getElementById('profilelist').style.display = 'none';
	document.getElementById('addPrinter').style.display = 'none';
	document.getElementById('editPrinter').style.display = 'block';
	enableDisableSettings("settings", true);
	// clear Alma printer selection
	var checkedBox = document.querySelectorAll('input[id=printerProfile]:checked')
	console.log ('checkedBox = ' + checkedBox[0].value);
	var editProfile = almaPrinterProfiles[checkedBox[0].value];
	console.log ('edit profile = ' + JSON.stringify(editProfile));
	buildAlmaPrinterDisplayName(globalAlmaPrinters, editProfile.almaPrinter);
	document.getElementById('editAlmaPrinterQueue').textContent = 'Editing Alma Printer Queue ' + displayName;
	document.getElementById('almaPrinterId').value = editProfile.almaPrinter;
	document.getElementById('borderTop').value = setBorderValue(editProfile.borderTop);
	document.getElementById('borderBottom').value = setBorderValue(editProfile.borderBottom);
	document.getElementById('borderLeft').value = setBorderValue(editProfile.borderLeft);
	document.getElementById('borderRight').value = setBorderValue(editProfile.borderRight);
	document.getElementById('pageHeight').value = editProfile.pageHeight;
	document.getElementById('pageWidth').value = editProfile.pageWidth;
	console.log ('local printer looking for ' + decodeURIComponent(editProfile.localPrinter));
	for (var i = 0; i < document.getElementById('localPrinter').length; i++) {
		console.log ('local printer match? ' + document.getElementById('localPrinter').options[i].value);
		if (document.getElementById('localPrinter').options[i].value == decodeURIComponent(editProfile.localPrinter)) {
			document.getElementById('localPrinter').selectedIndex = i;
			break;
		}
	}
	if (editProfile.letterFormat == undefined)
		editProfile.letterFormat = 'Letter';
	console.log ('letter format looking for ' + editProfile.letterFormat);
	for (var i = 0; i < document.getElementById('letterFormat').length; i++) {
		console.log ('letter format match? ' + document.getElementById('letterFormat').options[i].value);
		if (document.getElementById('letterFormat').options[i].value == editProfile.letterFormat) {
			document.getElementById('letterFormat').selectedIndex = i;
			break;
		}
	}
	if (editProfile.borderUnits == undefined)
		editProfile.borderUnits = 'in';
	console.log ('border units looking for ' + editProfile.borderUnits);
	for (var i = 0; i < document.getElementById('borderUnits').length; i++) {
		console.log ('border units match? ' + document.getElementById('borderUnits').options[i].value);
		if (document.getElementById('borderUnits').options[i].value == editProfile.borderUnits) {
			document.getElementById('borderUnits').selectedIndex = i;
			break;
		}
	}
	if (editProfile.color == undefined)
		editProfile.color = false;
	for (var i = 0; i < document.getElementById('colorOption').length; i++) {
		if (document.getElementById('colorOption').options[i].value == editProfile.color) {
			document.getElementById('colorOption').selectedIndex = i;
			break;
		}	
	}
	if (editProfile.orientation == undefined)
		editProfile.orientation = 'portrait';
	for (var i = 0; i < document.getElementById('orientationOption').length; i++) {
		if (document.getElementById('orientationOption').options[i].value == editProfile.orientation) {
			document.getElementById('orientationOption').selectedIndex = i;
			break;
		}	
	}
	formatChange();
	editMode = true;
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
			div.innerHTML = div.innerHTML + '<input type="checkbox" id="printerProfile" onclick="javascript:setPrinterProfileButtonState();" value="' + i + '">';
			div.innerHTML = div.innerHTML + 'Alma Printer:  ' + displayName + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Local Printer:  ' + decodeURIComponent(data[i].localPrinter ) + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Color:  ' + data[i].color + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Format:  ' + letterFormat
			if (letterFormat == "Custom")
				div.innerHTML = div.innerHTML + ' Page Width/Height ' + data[i].pageWidth + '/' + data[i].pageHeight + borderUnits;
			div.innerHTML = div.innerHTML + ', ' + data[i].orientation + '<br>';
			div.innerHTML = div.innerHTML + '&emsp; Border (' + borderUnits + '): top ' + borderTop + ', right ' + borderRight + ', bottom ' + borderBottom + ', left ' + borderLeft + '<br>';
			secondContainer.appendChild(div);
		}	
	}

}

function setPrinterProfileButtonState() {
	setRemovePrinterProfileButtonState();
	setEditPrinterProfileButtonState();
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

function setEditPrinterProfileButtonState () {
	var checkedBoxes = document.querySelectorAll('input[id=printerProfile]:checked');
	if (checkedBoxes.length != 1) {
		document.getElementById("editPrinterProfileButton").disabled = true;
	}
	else {
		document.getElementById("editPrinterProfileButton").disabled = false;		
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
	setEditPrinterProfileButtonState();
	setAddPrinterProfileButtonState();
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

function formatChange() {
	console.log ('change format = ' + document.getElementById('letterFormat').value);
	if (document.getElementById('letterFormat').value == "Custom") {
		document.getElementById('customFormat').style.display = 'block';
	}
	else {
		document.getElementById('customFormat').style.display = 'none';
	}
}