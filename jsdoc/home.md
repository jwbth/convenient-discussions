# Convenient Discussions code documentation

See "[Development](https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions#Development)" and "[Configuring for a wiki](https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions#Configuring_for_a_wiki)" sections of the script's home page for some guidelines about developing for Convenient Discussions.

This documentation is not complete. Sometimes I (Jack who built the house) am just too lazy to add JSDoc for every minor functionality or property. But it provides a good starting point.

Some specifics:
* Private methods and properties are not on the website, but many of them are documented in the code.
* Protected methods _are_ on the website.
* Public methods that are not intended for external use are marked with the comment "_For internal use_".
* Internal events emitted by {@link OO.EventEmitter} are not documented – only the ones fired on {@link https://doc.wikimedia.org/mediawiki-core/master/js/Hooks.html mw.hook}.
