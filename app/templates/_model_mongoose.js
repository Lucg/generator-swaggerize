'use strict';

var mongoose = require('mongoose');

var <%=id%>Model =function () {

	var <%=id%>Schema = mongoose.Schema({
		id: String
	});
	
	return mongoose.model(<%="'"+id+"'"%>,<%=id%>Schema);
}

module.exports = new <%=id%>Model();
