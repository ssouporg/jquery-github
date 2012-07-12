(function($) {

  var api = "https://api.github.com";

  var methods = {
	init: function( options ) {
	},

	/**
	 * Returns the github raw URL of a given resource.
	 */
	raw: function( user, repo, tag, path ) {
		return "https://raw.github.com/" + user + "/" + repo + "/" + tag + "/" + path;
	},

	/**
	* Gets info for a given tree, given a tree sha/tag name and optionally a path relative to it.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@tree either the name of a tag or the sha of a tag/tree
	*	@path the root path of the tree
	* @returns a deferred for the call; callback will yield a tree object
	*/
	tree: function( options ) {
		if ( options.path ) {
			return $( this ).github( 'treeAtPath', options );
		} else {
			return jsonCall( api + "/repos/" + options.user + "/" + options.repo + "/git/trees/" + options.tree );
		}
	},

	/**
	* Gets info for a given path.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@tree either the name of a tag or the sha of a tag/path
	* 	@path the path
	* @returns a deferred for the call; callback will yield a tree object
	*/
	treeAtPath: function( options ) {
		var dr = $.Deferred();
		var drd = function( tree ) { dr.resolveWith( this, [tree] ); };
		var drf = function() { dr.reject(); };

		var path = cleanPath(options.path);

		var opt = $.extend( {}, options );
		delete opt.path;
		$( this ).github( 'tree', opt )
			.done( function( tree ) {
				if ( path ) {
					// still path levels to navigate to..
					var indexOfSlash = path.indexOf( '/' );
					var firstLevel;
					if ( indexOfSlash > 0 ) {
						firstLevel = path.substring( 0, indexOfSlash );
						path = path.substring( indexOfSlash + 1 );
					} else {
						firstLevel = path;
						path = null;
					}

					// ...look for the sha of first level directory in the path..
					var firstLevelSHA;
					for ( var i = 0; i < tree.tree.length; i ++) {
						if (tree.tree[i].type == 'tree' && tree.tree[i].path == firstLevel) {
							firstLevelSHA = tree.tree[i].sha;
						}
					}

					if ( firstLevelSHA ) {
						// ..navigate down one level
						$( this ).github( 'treeAtPath', {
							user: options.user,
							repo: options.repo,
							tree: firstLevelSHA,
							path: path
						} ).done( drd ).fail( drf );
					} else {
						drf();
					}
				} else {
					// got it
					dr.resolveWith( this, [tree] );
				}
			} )
			.fail( drf );

		return dr.promise();
	},

	/**
	* Get blob content given its sha or a tree and the path of the blob relative to that tree.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@sha sha of the blob
	* 	@tree sha of a tree object containing the blob
	* 	@path the path of the blob to retrieve, with respect to the tree object
	* @returns a deferred for the call; callback will yield a blob object
	*/
	blob: function( options ) {
		var path = cleanPath( options.path );
		if ( path ) {
			return $( this ).github( 'blobAtPath', options );
		} else {
			return jsonCall( api + "/repos/" + options.user + "/" + options.repo + "/git/blobs/" + options.sha );
		}
	},

	/**
	* Get blob content given a tree and the path of the blob relative to that tree.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@tree either the name of a tag or the sha of a tag/path
	* 	@path the path
	* @returns a deferred for the call; callback will yield a blob object
	*/
	blobAtPath: function( options ) {
		var dr = $.Deferred();
		var drd = function( blob ) { dr.resolveWith( this, [blob] ); };
		var drf = function() { dr.reject(); };

		var path = cleanPath(options.path);
		// extract last blob name from path
		var indexOfSlash = path.lastIndexOf( '/' );
		var blobName;
		if ( indexOfSlash > 0 ) {
			blobName = path.substring( indexOfSlash + 1 );
			path = path.substring( 0, indexOfSlash );
		} else {
			blobName = path;
			path = null;
		}

		var opt = $.extend( {}, options );
		opt.path = path;
		$( this ).github( 'tree', opt )
			.done( function( tree ) {
				// look for the blob sha
				for ( var i = 0; i < options.tree.tree.length; i ++) {
					if (options.tree.tree[i].type == 'blob' && options.tree.tree[i].path == blobName) {
						sha = options.tree.tree[i].sha;
					}
				}
	
				// retrieve the blob
				opt = $.extend( {}, options );
				delete opt.path;
				$( this ).github( 'blob', opt ).done( drd ).fail( drf );
			} )
			.fail( drf );

		return dr.promise();
	},

	/**
	* Get a reference object.
	*
	* @user the user
	* @repo the repository
	* @ref the reference to retrieve
	* @returns a deferred for the call; callback will yield a reference object
	*/
	ref: function( user, repo, ref ) {
		return jsonCall(
			api + "/repos/" + user + "/" + repo + "/git/refs/" + ref
		);
	},

	/**
	* Get a commit object.
	*
	* @user the user
	* @repo the repository
	* @sha sha of the commit object to retrieve
	* @returns a deferred for the call; callback will yield a commit object
	*/
	commit: function( user, repo, sha ) {
		return jsonCall(
			api + "/repos/" + user + "/" + repo + "/commits/" + sha
		);
	},

	/**
	* Gets info for a given path.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@tag either the name or the sha of a tag
	* 	@path the path
	* @returns a deferred for the call; callback will yield a tree object
	*/
	path: function( options ) {
		var dr = $.Deferred();
		var drd = function() { dr.resolve(); };
		var drf = function() { dr.reject(); };

		jsonCall( api + "/repos/" + options.user + "/" + options.repo + "/git/trees/" + options.tag )
			.done(drd).fail(drf);

		return dr;
	},

	getResource: function( user, repo, tag, path ) {
		$(this).github('tree', user)
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

  function cleanPath( path ) {
	if ( path ) {
		// clean the path
		path = path.trim();
		if ( path[0] == '/' ) {
			path = path.substring( 1, path.length );
		}
	}
	return path;
  }

  function jsonCall( url ) {
	return jQuery.ajax({
		url: url,
		dataType: "json",
	});
  }

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
