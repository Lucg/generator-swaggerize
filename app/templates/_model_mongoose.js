'use strict';
var mongoose = require('mongoose');

<%
var allowedTypes = ['integer', 'long', 'float', 'double', 'number', 'string', 'password', 'boolean', 'date', 'dateTime', 'array', 'object'];

var propertyMap = function (property) {
  switch (property.type) {
    case 'integer':
    case 'long' :
    case 'float' :
    case 'double' :
		case 'number' :
      return 'Number';
    case 'string':
    case 'password':
      return 'String';
    case 'boolean':
      return 'Boolean';
    case 'date':
    case 'dateTime':
      return 'Date';
    case 'array':
      return [propertyMap(property.items)];
    default:
			throw new Error('Unrecognized schema type: ' + property.type);
  }
};

var convertToJSON = function(spec){
  var swaggerJSON = {};
  var type = typeof(spec);
  switch (type) {
    case 'object':
      if (spec instanceof Buffer){
        swaggerJSON = JSON.parse(spec);
      } else {
        swaggerJSON = spec;
      }
      break;
    case 'string':
      swaggerJSON = JSON.parse(spec);
      break;
    default:
      throw new Error('Unknown or invalid spec object');
      break;
  }
  return swaggerJSON;
};

var isSimpleSchema = function(schema) {
  return schema.type && isAllowedType(schema.type);
};

var isAllowedType = function(type) {
  return allowedTypes.indexOf(type) != -1;
};

var isPropertyHasRef = function(property) {
  return property['$ref'] || ((property['type'] == 'array') && (property['items']['$ref']));
}

var getSchema = function(object, definitions) {
  var props = {};
	console.log(definitions);
  _.forEach(object, function (property, key) {
    if (isPropertyHasRef(property)) {
      var refRegExp = /^#\/definitions\/(\w*)$/;
      var refString = property['$ref'] ? property['$ref'] : property['items']['$ref'];
      var propType = refString.match(refRegExp)[1];
      props[key] = getSchema(definitions[propType]['properties'] ? definitions[propType]['properties'] : definitions[propType], definitions);
    }
    else if (property.type) {
      var type = propertyMap(property);
      props[key] = {type: type};
    }
    else if (isSimpleSchema(object)) {
      props = {type: propertyMap(object)};
    }
  });

  return props;
};%>

var <%=id%>Model =function () {

	var <%=id%>Schema = mongoose.Schema({
	  <%

	  var props = getSchema(properties,definitions);
	  _.forEach(props, function (property, key) { %>
	    <%=key%> : <%=JSON.stringify(property).replace(/"/g,"")%>,
	  <% }) %>
	  });
	return mongoose.model(<%="'"+id+"'"%>,<%=id%>Schema);
}

module.exports = new <%=id%>Model();
