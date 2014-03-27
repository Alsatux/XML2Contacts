// Jean Luc Biellmann - contact@alsatux.com - 20140226 - v0.4

var _Log = {
	clear: function () {
		var div = document.getElementById('log');
		div.innerHTML = '';
	},
	info: function (mess, clear=false) {
		var div = document.getElementById('log');
		div.innerHTML += '<p>' + mess + '</p>';
	},
	error: function (mess, clear=false) {
		var div = document.getElementById('log');
		div.innerHTML += '<p style="color:red">' + mess + '</p>';
	},
};

var _Storage  = {
	ls: function (device, dir, callback) {
		var files = [];
		var storage = navigator.getDeviceStorage(device);
		var cursor = storage.enumerate(dir);
		cursor.onsuccess = function () {
			var file = this.result;
			if (file != null) {
				files.push(file);
				this.done = false;
			} else {
				this.done = true;
				
				callback(files);
			}
			if (!this.done) {
				this.continue();
			}
		}
		cursor.onerror = function () {
			_Log.error('Warning: ' + device + ':' + dir + ' not found - USB not unppluged ?');
			callback(files);
		}
	}
};

var _XML2C = {

	xmlnode: null,
	i: 0,
	counter: 0,
	json: {},
	photos: {},
	
	info: function (id,mess) {
		var div = document.getElementById(id);
		div.innerHTML = mess;
	},
	
	init: function () {
		_Storage.ls('sdcard', 'contacts2xml', function (files) {
			var select = document.getElementById('sel1');
			select.innerHTML = '';
			var re = new RegExp('^.*contacts2xml/([0-9]{14}).xml$','');
			var opts = {};
			for (var i=0;i<files.length;i++) {
				var m = (files[i].name).match(re);
				if (m!=null) {
					var txt = m[1];
					opts[txt] = files[i].name;
				}
			}
			var keys = Object.keys(opts);
			keys.sort();
			keys.reverse();
			for (var i=0;i<keys.length;i++) {
				var key = keys[i];
				var opt = new Option(key,opts[key]);
				select.appendChild(opt);	
			}
		});
		return true;
	},

	clearAll: function () {
		if (confirm('Delete all contacts ? (no way back !)')) {
			_Log.clear();
			document.getElementById('counter').innerHTML = '';
			_Log.info('Deleting all contacts...');
			document.getElementById('chooser').style.display = 'none';
			document.getElementById('cleaner').style.display = 'none';
			var req = window.navigator.mozContacts.clear();
			req.onsuccess = function () {
				_Log.clear();
				_Log.info("Contacts removed !");
				document.getElementById('chooser').style.display = '';
				document.getElementById('cleaner').style.display = '';
			};
			req.onerror = function () {
				_Log.clear();
				_Log.error("Removing all contacts failed.");
				document.getElementById('chooser').style.display = '';
				document.getElementById('cleaner').style.display = '';
			};
		}
	},

	restore: function () {
		_Log.clear();
		document.getElementById('counter').innerHTML = '';
		_Log.info('Restoring contacts from sd-card...');
		var select = document.getElementById('sel1');
		var index = select.options.selectedIndex;
		if (index!=-1) {
			document.getElementById('chooser').style.display = 'none';
			document.getElementById('cleaner').style.display = 'none';
			var filename = select.options[index].value;
			var medium = navigator.getDeviceStorage('sdcard');
			var req = medium.get(filename);
			req.onsuccess = function () {
				_XML2C.album(this.result, filename);
			}
			req.onerror = function () {
				_Log.error("Unable to read file: " + this.error);
				_XML2C.stop_restore();
			}
		} else {
			_Log.error('No file selected !');
		}
	},
	
	stop_restore: function () {
		document.getElementById('chooser').style.display = '';
		document.getElementById('cleaner').style.display = '';		
		_Log.info('Finished !');
	},

	album: function (file, filename) {
		var re = new RegExp('^.*contacts2xml/([0-9]{14}).xml$','');
		var m = filename.match(re);
		var photopath = 'contacts2xml/' + m[1];
		_Storage.ls('sdcard', photopath, function (files) {
			_XML2C.photos = {};
			var re2 = new RegExp('^.*' + photopath + '/(.*).jpg$','');
			for (var i=0;i<files.length;i++) {
				var m2 = (files[i].name).match(re2);
				if (m2!=null) {
					var photoid = m2[1];
					_XML2C.photos[photoid] = files[i].name;
				}
			}
			_XML2C.handle(file, filename);
		});								
	},

	handle: function (file, filename) {
		var reader = new FileReader();
		reader.onload = function(e) {
			var text = (reader.result).replace('<?xml version="1.0" encoding="UTF-8"?>','');
			var parser = new DOMParser();
			var xmldoc = parser.parseFromString(text, 'text/xml');
			_XML2C.xmlnode = xmldoc.getElementsByTagName('contact');
			_XML2C.counter = 0;
			_XML2C.i = 0;
			_XML2C.loop();
		}		
		reader.readAsText(file, 'UTF-8');
	},
	
	loop: function () {
		if (_XML2C.i>=_XML2C.xmlnode.length) {
			_XML2C.stop_restore();
			return;
		}
		_XML2C.json = _XML2C.xml2json(_XML2C.xmlnode[_XML2C.i++]);
		// retrieve photo using old contact id
		if (_XML2C.json.id!=undefined && _XML2C.photos[_XML2C.json.id]!=undefined) {
			var storage = navigator.getDeviceStorage('sdcard');
			var req = storage.get(_XML2C.photos[_XML2C.json.id]);
			req.onsuccess = function () {
				var pict = this.result;
				_XML2C.json.photo = [new Blob([pict], {type: 'image/jpg'})];
				_XML2C.record(_XML2C.json);
			}
			req.onerror = function () {
				_Log.error('Unable to read photo ' + _XML2C.json.id);
			}
		} else {
			_XML2C.record(_XML2C.json);
		}
	},

	record: function (json) {
		delete json.id;		
		var person = new mozContact(json);
		if ('init' in person) // for ffos < 1.3
			person.init(json);			
		var req = window.navigator.mozContacts.save(person);
		req.onsuccess = function () {
			_XML2C.counter++;
			document.getElementById('counter').innerHTML = _XML2C.counter + ' contacts restored...';
			_XML2C.loop();
		}
		req.onerror = function () {
			_Log.error("Error adding contact !");
			_XML2C.loop();
		}
	},

	xml2json: function (xml) {
		var obj = {}
		if (xml.hasChildNodes()) {
			for(var i=0; i<xml.childNodes.length; i++) {
				var item = xml.childNodes.item(i);
				var nodeName = item.nodeName;
				// ignore all read only fields but the id (will be used retrieve photo later)
				if (nodeName.match(/(published|updated)/))
					continue;
				if (typeof(nodeName)!='undefined') {
					if (nodeName.match(/(tel|email|url)/)) {
						var child_obj = {};
						for(var j = 0; j<item.childNodes.length; j++) {
							var subitem = item.childNodes.item(j);
							if (subitem.childNodes[0]!=undefined && subitem.childNodes[0].nodeValue!=undefined) {
								if (subitem.nodeName=='type') {
									if (typeof(child_obj['type'])=='undefined')
										child_obj['type'] = [];
									child_obj['type'].push(subitem.childNodes[0].nodeValue);
								}
								else if (subitem.nodeName=='value')
									child_obj['value'] = subitem.childNodes[0].nodeValue;
							}
						}
						if (child_obj['value']!=undefined && child_obj['value'].length) {
							if (typeof(obj[nodeName])=='undefined')
								obj[nodeName] = [];
							obj[nodeName].push(child_obj);
						}
					}
					else if (nodeName=='adr') {
						var child_obj = {};
						for(var j = 0; j<item.childNodes.length; j++) {
							var subitem = item.childNodes.item(j);
							if (subitem.childNodes[0]!=undefined && subitem.childNodes[0].nodeValue!=undefined) {
								if (subitem.nodeName=='type') {
									if (typeof(child_obj['type'])=='undefined')
										child_obj['type'] = [];
									child_obj['type'].push(subitem.childNodes[0].nodeValue);
								}
								else if (subitem.nodeName=='pref')
									child_obj['pref'] = subitem.childNodes[0].nodeValue=='true' ? true : false;
								else if (subitem.nodeName.match(/(streetAddress|locality|region|postalCode|countryName)/))
									child_obj[subitem.nodeName] = subitem.childNodes[0].nodeValue;
							}
						}
						if (typeof(obj[nodeName])=='undefined')
							obj[nodeName] = [];
						obj[nodeName].push(child_obj);
					}
					else {
						if (item.childNodes[0]!=undefined && item.childNodes[0].nodeValue!=undefined) {
							if (nodeName.match(/(name|honorificPrefix|givenName|additionalName|familyName|honorificSuffix|nickname|category|org|jobTitle|note|key)/)) {
								if (typeof(obj[nodeName])=='undefined')
									obj[nodeName] = [];
								obj[nodeName].push(item.childNodes[0].nodeValue);
							}
							else if (nodeName.match(/(id|sex|genderIdentity)/)) {
								obj[nodeName] = item.childNodes[0].nodeValue;
							}
							else if (nodeName.match(/(bday|anniversary)/)) {
								obj[nodeName] = new Date(item.childNodes[0].nodeValue);
							}
						}
					}
				}
			}
		}
		return obj;
	}

};

window.onload = function () {
	_XML2C.init();
	var but1 = document.getElementById('but1');
	but1.addEventListener("click", _XML2C.restore);
	var but2 = document.getElementById('but2');
	but2.addEventListener("click", _XML2C.clearAll);
}
