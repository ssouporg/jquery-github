(function($) {

  var methods = {
    init: function( options ) {
	},
    rawResourceURL: function( user, repo, tag, path ) {
        return "https://raw.github.com/" + user + "/" + repo + "/" + tag + "/" + path;
    },
    commit: function() {
    }
  }

  $.fn.github = function( method ) {
    if ( methods[method] ) {
      return methods[method].apply( this, Array.prototype.slice.call( arguments, 1 ));
    } else if ( typeof method === 'object' || ! method ) {
      return methods.init.apply( this, arguments );
    } else {
      $.error( 'Method ' +  method + ' does not exist on jQuery.github' );
    }
  };

  function jsonpCall( url, callbackContext, callback, failCallback ) {
	/* No proper handling of error 404, ie fail is not fired => using jquery-jsonp plugin. */
	/*jQuery.ajax({
		url: url,
		dataType: "jsonp",
		jsonpCallback: "resource"
	}).done(callback).fail(failCallback);*/

	jQuery.jsonp({
		url: url,
		callback: "resource",
        context: callbackContext,
		success: callback,
		error: failCallback
	});
  }
})( jQuery );
