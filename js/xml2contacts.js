// Jean Luc Biellmann - contact@alsatux.com - 20140410 - v0.5

var _Log = {
	clear: function () {
		document.getElementById('log').innerHTML = '';
	},
	push: function (mess, className='') {
		document.getElementById('log').innerHTML += '<p' + (className.length ? ' class="' + className + '"' : '') + '>' + mess + '</p>';
	},
	info: function (mess) {
		_Log.push(mess, 'info');
	},
	warn: function (mess) {
		_Log.push(mess, 'warn');
	},
	error: function (mess) {
		_Log.push(mess, 'error');
	}
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

var _DataURL = {
	decode2Uint8Array: function (data) {
		// decode a base64 string
		var binary = atob(data);
		// create an array of byte values where each element will be the value of the byte
		var buffer = [];
		for (var i=0;i<binary.length;i++)
			// charCodeAt() method returns the Unicode of the character at the specified index in a string. (H -> 72)
			buffer.push(binary.charCodeAt(i));
		// convert the array of byte values into a real typed byte array
		return new Uint8Array(buffer);
	}
};

var _XML2C = {

	xmlnode: null,
	i: 0,
	counter: 0,
	json: {},
	photos: {},
	cb1_checked: null,
	cb2_checked: null,
	
	info: function (id,mess) {
		var div = document.getElementById(id);
		div.innerHTML = mess;
	},
	
	init: function () {
		var but1 = document.getElementById('but1');
		but1.addEventListener("click", _XML2C.restore);
		var but2 = document.getElementById('but2');
		but2.addEventListener("click", _XML2C.clearAll);
		var but3 = document.getElementById('but3');
		but3.addEventListener("click", _XML2C.show_part1);
		_XML2C.reset();
	},
	
	reset: function () {		
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

	show_part1: function () {
		document.getElementById('part1').style.display = '';
		document.getElementById('part2').style.display = 'none';	
		document.getElementById('but3').style.display = 'none';
		_Log.clear();
		document.getElementById('count').innerHTML = '';
		window.scrollTo(0,0);
	},
	
	show_and_reset_part2: function () {
		document.getElementById('part1').style.display = 'none';
		document.getElementById('part2').style.display = '';		
		document.getElementById('but3').style.display = 'none';
		_Log.clear();
		document.getElementById('count').innerHTML = '';
		window.scrollTo(0,0);
	},

	clearAll: function () {
		if (confirm('Delete all contacts ? (no way back !)')) {
			_XML2C.show_and_reset_part2();
			_Log.info('Deleting all contacts...');
			var req = window.navigator.mozContacts.clear();
			req.onsuccess = function () {
				_Log.clear();
				_Log.warn("Contacts removed !");
				document.getElementById('but3').style.display = '';
			};
			req.onerror = function () {
				_Log.clear();
				_Log.error("Removing all contacts failed.");
				document.getElementById('but3').style.display = '';
			};
		}
	},

	restore: function () {
		_XML2C.show_and_reset_part2();
		// read current state
		_XML2C.cb1_checked = document.getElementById('cb1').checked;
		_XML2C.cb2_checked = document.getElementById('cb2').checked;
		var select = document.getElementById('sel1');
		var index = select.options.selectedIndex;
		if (index==-1)
			return _Log.error('No file selected !');
		var filename = select.options[index].value;
		var backup_date = filename.replace('contacts2xml/','').replace('.xml','');
		backup_date = parseInt(backup_date.substr(0,8),10);
		if (backup_date<20140417) {
			if (_XML2C.cb2_checked && !confirm('It seems your backup has been made with a  version of Cockatoo < 0.5, so you should rename your old photos from "XXX.jpg" to "XXX.1.jpg" before restoring your contacts. Continue ?')) {
				_Log.info('Program aborted !');
				_XML2C.stop_restore();
				return false;
			}
		}			
		if (_XML2C.cb1_checked || _XML2C.cb2_checked || confirm('Do you really want to ignore all photos ?')) {
			if (_XML2C.cb1_checked && _XML2C.cb2_checked) {
				_Log.info('Get photos from data_uri and sd-card...');
			} else {
				if (_XML2C.cb1_checked)
					_Log.info('Get photos from data_uri...');
				if (_XML2C.cb2_checked)
					_Log.info('Get photos from sd-card...');
			}
			// read file from sd-card
			var medium = navigator.getDeviceStorage('sdcard');
			var req = medium.get(filename);
			req.onsuccess = function () {
				_XML2C.album(this.result, filename);
			}
			req.onerror = function () {
				_Log.error("Unable to read file: " + this.error);
				_XML2C.stop_restore();
			}
		} else {
			_Log.info('Program aborted !');
			_XML2C.stop_restore();			
		}
	},

	stop_restore: function () {
		document.getElementById('but3').style.display = '';
		_Log.info('Finished !');
	},

	album: function (file, filename) {
		_XML2C.photos = {};
		if (!_XML2C.cb2_checked) {
			// no external JPG files
			_XML2C.handle(file, filename);
		} else {
			var re = new RegExp('^.*contacts2xml/([0-9]{14})\\.xml$','');
			var m = filename.match(re);
			var photopath = 'contacts2xml/' + m[1];
			_Storage.ls('sdcard', photopath, function (files) {
				var re2 = new RegExp('^.*' + photopath + '/(.*)\\.[0-9]+\\.jpg$','');
				for (var i=0;i<files.length;i++) {
					var m2 = (files[i].name).match(re2);
					if (m2!=null) {
						var photoid = m2[1];
						if (!(photoid in _XML2C.photos))
							_XML2C.photos[photoid] = [];
						_XML2C.photos[photoid].push(files[i].name);
					}
				}
				_XML2C.handle(file, filename);
			});							
		}	
	},

	handle: function (file, filename) {
		var reader = new FileReader();
		reader.onload = function(e) {
			var text = (reader.result).replace('<?xml version="1.0" encoding="UTF-8"?>','');
			var parser = new DOMParser();
			var xml_doc = parser.parseFromString(text, 'text/xml');
			// avoid firefox to split long datauri in parts...
			//xml_doc.normalize();
			_XML2C.xmlnode = xml_doc.getElementsByTagName('contact');
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
		if (!_XML2C.cb1_checked) { 
			// remove photos found in data-uri
			if ('photo' in _XML2C.json)
				delete _XML2C.json.photo;
		}
		if (!_XML2C.cb2_checked) { 
			// no external JPG files
			_XML2C.record(_XML2C.json);
		} else {
			if (!('id' in _XML2C.json) || !(_XML2C.json.id in _XML2C.photos)) {
				// no id given or no photo available
				_XML2C.record(_XML2C.json);
			} else {
				// retrieve photo using old contact id
				_XML2C.loop_photos(_XML2C.json, 0);
			}
		}
	},

	loop_photos: function (json, index) {
		if (index>=_XML2C.photos[json.id].length)
			return _XML2C.record(json);
		var filename = _XML2C.photos[json.id][index];
		var storage = navigator.getDeviceStorage('sdcard');
		var req = storage.get(filename);
		req.onsuccess = function () {
			var data = this.result;
			if (!('photo' in json))
				json.photo = [];
			json.photo.push( new Blob([data], {type: 'image/jpeg'}) );
			_XML2C.loop_photos(json, index+1);
		}
		req.onerror = function () {
			// ignore bad photos
			_Log.error('Unable to read photo ' + _XML2C.json.id + '.jpg');
			_XML2C.loop_photos(json, index+1);
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
			document.getElementById('count').innerHTML = _XML2C.counter + ' contacts restored...';
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
				if ('nodeName' in item) {
					var nodeName = item.nodeName;
					// ignore all read only fields but the id (will be used retrieve photo later)
					if (nodeName.match(/^(published|updated)$/)!=null)
						continue;
					if (nodeName.match(/^photo$/)!=null) {
						var xml_serializer = new XMLSerializer();
				      var data = xml_serializer.serializeToString(item);
				      var m = data.match(/^<photo>data:image\/jpe?g;base64,(([0-9a-zA-Z+\/]{4})*(([0-9a-zA-Z+\/]{2}==)|([0-9a-zA-Z+\/]{3}=))?)<\/photo>$/);
						if (m!=null) {
							if (!(nodeName in obj))
								obj[nodeName] = [];
							var blobdata = _DataURL.decode2Uint8Array(m[1]);
							obj[nodeName].push( new Blob([blobdata], {type: 'image/jpeg'}) );
						}
					}
					else if (nodeName.match(/^(tel|email|url)$/)!=null) {
						var child_obj = {};
						for(var j = 0; j<item.childNodes.length; j++) {
							var subitem = item.childNodes.item(j);
							if ('nodeName' in subitem && 'childNodes' in subitem && subitem.childNodes.length && 'nodeValue' in subitem.childNodes[0]) {
								if (subitem.nodeName=='type') {
									if (!('type' in child_obj))
										child_obj['type'] = [];
									child_obj['type'].push(subitem.childNodes[0].nodeValue);
								}
								else if (subitem.nodeName=='value')
									child_obj['value'] = subitem.childNodes[0].nodeValue;
							}
						}
						if ('value' in child_obj && child_obj['value'].length) {
							if (!(nodeName in obj))
								obj[nodeName] = [];
							obj[nodeName].push(child_obj);
						}
					}
					else if (nodeName=='adr') {
						var child_obj = {};
						for(var j = 0; j<item.childNodes.length; j++) {
							var subitem = item.childNodes.item(j);
							if ('nodeName' in subitem && 'childNodes' in subitem && subitem.childNodes.length && 'nodeValue' in subitem.childNodes[0]) {
								if (subitem.nodeName=='type') {
									if (!('type' in child_obj))
										child_obj['type'] = [];
									child_obj['type'].push(subitem.childNodes[0].nodeValue);
								}
								else if (subitem.nodeName=='pref')
									child_obj['pref'] = subitem.childNodes[0].nodeValue=='true' ? true : false;
								else if (subitem.nodeName.match(/^(streetAddress|locality|region|postalCode|countryName)$/)!=null)
									child_obj[subitem.nodeName] = subitem.childNodes[0].nodeValue;
							}
						}
						if (!(nodeName in obj))
							obj[nodeName] = [];
						obj[nodeName].push(child_obj);
					}
					else {
						if ('childNodes' in item && item.childNodes.length && 'nodeValue' in item.childNodes[0]) {
							if (nodeName.match(/^(name|honorificPrefix|givenName|additionalName|familyName|honorificSuffix|nickname|category|org|jobTitle|note|key)$/)!=null) {
								if (!(nodeName in obj))
									obj[nodeName] = [];
								obj[nodeName].push(item.childNodes[0].nodeValue);
							}
							else if (nodeName.match(/^(id|sex|genderIdentity)$/)!=null) {
								obj[nodeName] = item.childNodes[0].nodeValue;
							}
							else if (nodeName.match(/^(bday|anniversary)$/)!=null) {
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
}
