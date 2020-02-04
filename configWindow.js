const ipcRenderer = require('electron').ipcRenderer;
let selectedLocalPrinter;	
let savedAlmaPrinters;
let testRequest;		
const form = document.querySelector('form');
form.addEventListener('submit', submitForm);

//Handle saving of updated alma prin daemon settings
function submitForm(e){
	e.preventDefault();
	let badInterval = false;
	let interval = 0;
	const region = document.querySelector('#region').value;
	const apiKey = document.querySelector('#apiKey').value;
	const localPrinter = document.querySelector('#localPrinter').value;
	//Set interval based on which method radio button selected:  automatic or manual
	if (document.querySelector('input[name="method"]:checked').value == "manual") {
		interval = 0;
	}
	else {
		interval = document.querySelector('#interval').value;
		if (interval == 0) {
			badInterval = true;
		}
	}
	
	//If all required config values entered, it is ok to save.
	if (apiKey.length  && !badInterval) {
		var configString = "{\"region\": \"" + region + "\",";
		configString = configString + "\"apiKey\": \"" + apiKey + "\",";

		//Now build the list of selected Alma printers
		var x = document.getElementById("almaPrinter");
		var selectedAlmaPrinters = "";
		for (var i = 0; i < x.options.length; i++) {
			if (x.options[i].selected) {
				if (selectedAlmaPrinters.length) {
					selectedAlmaPrinters = selectedAlmaPrinters + ",";
				} 
				selectedAlmaPrinters = selectedAlmaPrinters + "\"" + x.options[i].value + "\"";
			}
		}
		configString = configString + "\"almaPrinter\": [" + selectedAlmaPrinters + "],";
		
		configString = configString + "\"localPrinter\": \"" + encodeURIComponent(localPrinter) +  "\",";
		configString = configString + "\"interval\": \"" + interval + "\"}";
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
	let element = document.getElementById('region');
	element.value = configSettings.region;
	document.getElementById('apiKey').value = configSettings.apiKey;

	if (configSettings.interval > 0) {
		document.getElementById('interval').value = configSettings.interval;
		document.getElementById('methoda').checked = true;
	}
	else {
		document.getElementById('methodm').checked = true;
	}

	savedAlmaPrinters = configSettings.almaPrinter;
	selectedLocalPrinter = configSettings.localPrinter;
	console.log ('send-settings selectedLocalPrinter = ' + selectedLocalPrinter);
})

//Handle loading local workstation printers
ipcRenderer.on('local-printers', (event, localPrinters) => {
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

//Test API key 
function testApiKey(){
	const region = document.querySelector('#region').value;
	const apiKey = document.querySelector('#apiKey').value;
	let testRequest;	
	testRequest = "https://api-" + region + ".hosted.exlibrisgroup.com/almaws/v1/conf/test?apikey=" + apiKey;
	const https = require('https');
	let data = ''
  
	console.log ("request = " + testRequest);
  
  	https.get(
	  testRequest, (resp) =>{
		// A chunk of data has been received.
		resp.on('data', (chunk) =>{
		  data += chunk;
		});
		// Response has ended.
		resp.on('end', () =>{
		  console.log("test get request response done!");
		  //console.log("response = " + data);
		  if (data.substring(0, 5) == "<?xml") {
			//data = data.replace(/\s/g, '');
			console.log("xml response = " + data);
			let errorsExist = data.indexOf("<errorsExist>true</errorsExist>");
			if (errorsExist != -1) {
			  console.log ("Error in request");
			  let startErrorMessage = data.indexOf("<errorMessage>") + 14;
			  let endErrorMessage = data.indexOf("</errorMessage>");
			  let errorMessage = data.substring(startErrorMessage, endErrorMessage);
			  console.log ("Error message = " + errorMessage);
			  alert(errorMessage);
			}
			else {
				alert("\"GET\" test success!")
			}
		  }
		})
 
	  }).on('error', (e) => {
		const options = {
		  type: 'error',
		  buttons: ['Close'],
		  title: 'Communication Error',
		  message: 'An error occurred communicating with Alma. Please check your Alma configuration options and try again.',
		  detail: JSON.stringify(e)
		}
		alert (JSON.stringify(e));
	  })
}

//Handle loading Alma printers
ipcRenderer.on('alma-printers', (event, almaPrinters) => {
  let i;

  //Load Alma printer queue printers into the selection list
  var sel = document.getElementById('almaPrinter');
  const printersDefined = almaPrinters.total_record_count;
  console.log ("Parsed Alma printers JSON.  Number of printers = " + printersDefined);
  let displayName;
  for (i = 0; i < printersDefined; i++) {
	if (almaPrinters.printer[i].description !== null) {
	  displayName = almaPrinters.printer[i].name + " - " + almaPrinters.printer[i].description;
	}
	else {
	  displayName = almaPrinters.printer[i].name
	}
  	var opt = document.createElement('option');
	opt.appendChild(document.createTextNode(displayName));
	opt.value = almaPrinters.printer[i].id;
	sel.appendChild(opt);
  }
  //Now here we need to select the Alma printers previously saved in the json config file 
  let entries = savedAlmaPrinters.toString().split(",");
  for (i = 0; i < entries.length; i++) {
	 console.log ("entry = " + entries[i]);
	 for (let j = 0; j < sel.options.length; j++) {
		console.log ("option = " + sel.options[j].value);
		  if (sel.options[j].value == entries[i]) {
			  sel.options[j].selected = true;
			  break;
		  }
	  }
   }
})

