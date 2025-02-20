'use strict'

const CompilerImport = require('../compiler/compiler-imports')
const EventManager = require('../../lib/events')
const modalDialogCustom = require('../ui/modal-dialog-custom')
const tooltip = require('../ui/tooltip')
const remixLib = require('remix-lib')
const Storage = remixLib.Storage

class FileProvider {
  constructor (name) {
    this.event = new EventManager()
    this.type = name
    this.providerExternalsStorage = new Storage('providerExternals:')
    this.externalFolders = [this.type + '/swarm', this.type + '/ipfs', this.type + '/github', this.type + '/gist', this.type + '/https']
  }

  addNormalizedName (path, url) {
    this.providerExternalsStorage.set(this.type + '/' + path, url)
  }

  removeNormalizedName (path) {
    this.providerExternalsStorage.remove(path)
  }

  normalizedNameExists (path) {
    return this.providerExternalsStorage.exists(path)
  }

  getNormalizedName (path) {
    return this.providerExternalsStorage.get(path)
  }

  isExternalFolder (path) {
    return this.externalFolders.includes(path)
  }

  discardChanges (path) {
    this.remove(path)
    const compilerImport = new CompilerImport()
    this.providerExternalsStorage.keys().map(value => {
      if (value.indexOf(path) === 0) {
        compilerImport.import(
          this.getNormalizedName(value),
          true,
          (loadingMsg) => { tooltip(loadingMsg) },
          (error, content, cleanUrl, type, url) => {
            if (error) {
              modalDialogCustom.alert(error)
            } else {
              this.addExternal(type + '/' + cleanUrl, content, url)
            }
          }
        )
      }
    })
  }

  exists (path, cb) {
    cb(null, this._exists(path))
  }

  _exists (path) {
    var unprefixedpath = this.removePrefix(path)
    return window.remixFileSystem.existsSync(unprefixedpath)
  }

  init (cb) {
    cb()
  }

  get (path, cb) {
    cb = cb || function () {}
    if (this.normalizedNameExists(path)) path = this.getNormalizedName(path) // ensure we actually use the normalized path from here
    var unprefixedpath = this.removePrefix(path)
    var exists = window.remixFileSystem.existsSync(unprefixedpath)
    if (!exists) return cb(null, null)
    window.remixFileSystem.readFile(unprefixedpath, 'utf8', (err, content) => {
      cb(err, content)
    })
  }

  set (path, content, cb) {
    cb = cb || function () {}
    var unprefixedpath = this.removePrefix(path)
    var exists = window.remixFileSystem.existsSync(unprefixedpath)
    if (exists && window.remixFileSystem.readFileSync(unprefixedpath, 'utf8') === content) return true

    if (!exists && unprefixedpath.indexOf('/') !== -1) {
      const paths = unprefixedpath.split('/')
      paths.pop() // last element should the filename
      if (paths.length && paths[0] === '') paths.shift()
      let currentCheck = ''
      paths.forEach((value) => {
        currentCheck = currentCheck + '/' + value
        if (!window.remixFileSystem.existsSync(currentCheck)) {
          window.remixFileSystem.mkdirSync(currentCheck)
          this.event.trigger('folderAdded', [this._normalizePath(currentCheck)])
        }
      })
    }
    try {
      window.remixFileSystem.writeFileSync(unprefixedpath, content)
    } catch (e) {
      cb(e)
      return false
    }
    if (!exists) {
      this.event.trigger('fileAdded', [this._normalizePath(unprefixedpath), false])
    } else {
      this.event.trigger('fileChanged', [this._normalizePath(unprefixedpath)])
    }
    cb()
    return true
  }

  // this will not add a folder as readonly but keep the original url to be able to restore it later
  addExternal (path, content, url) {
    if (url) this.addNormalizedName(path, url)
    return this.set(path, content)
  }

  isReadOnly (path) {
    return false
  }

  remove (path) {
    var unprefixedpath = this.removePrefix(path)
    if (!this._exists(unprefixedpath)) {
      return false
    }
    const stat = window.remixFileSystem.statSync(unprefixedpath)
    try {
      if (stat.isDirectory()) {
        window.remixFileSystem.rmdirSync(unprefixedpath, console.log)
      } else {
        window.remixFileSystem.unlinkSync(unprefixedpath, console.log)
      }
      this.event.trigger('fileRemoved', [this._normalizePath(unprefixedpath)])
      return true
    } catch (e) {
      console.log(e)
      return false
    }
  }

  rename (oldPath, newPath, isFolder) {
    var unprefixedoldPath = this.removePrefix(oldPath)
    var unprefixednewPath = this.removePrefix(newPath)
    if (this._exists(unprefixedoldPath)) {
      window.remixFileSystem.renameSync(unprefixedoldPath, unprefixednewPath)
      this.event.trigger('fileRenamed', [
        this._normalizePath(unprefixedoldPath),
        this._normalizePath(unprefixednewPath),
        isFolder
      ])
      return true
    }
    return false
  }

  resolveDirectory (path, callback) {
    if (!path) return callback(null, { [this.type]: {} })
    path = this.removePrefix(path)
    if (path.indexOf('/') !== 0) path = '/' + path

    window.remixFileSystem.readdir(path, (error, files) => {
      var ret = {}
      if (files) {
        files.forEach(element => {
          const absPath = (path === '/' ? '' : path) + '/' + element
          ret[absPath.indexOf('/') === 0 ? absPath.replace('/', '') : absPath] = { isDirectory: window.remixFileSystem.statSync(absPath).isDirectory() }
          // ^ ret does not accept path starting with '/'
        })
      }
      callback(error, ret)
    })
  }

  removePrefix (path) {
    path = path.indexOf(this.type) === 0 ? path.replace(this.type, '') : path
    return path
  }

  _normalizePath (path) {
    if (path.indexOf('/') !== 0) path = '/' + path
    return this.type + path
  }
}

module.exports = FileProvider
