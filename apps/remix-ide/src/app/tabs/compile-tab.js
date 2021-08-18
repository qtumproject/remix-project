/* global */
import React from 'react' // eslint-disable-line
import ReactDOM from 'react-dom'
import { SolidityCompiler } from '@remix-ui/solidity-compiler' // eslint-disable-line
import { CompileTabLogic } from '@remix-ui/solidity-compiler' // eslint-disable-line
import { CompilerApiMixin } from '@remixproject/solidity-compiler-plugin'
import { ViewPlugin } from '@remixproject/engine-web'
import QueryParams from '../../lib/query-params'
// import { ICompilerApi } from '@remix-project/remix-lib-ts'
import * as packageJson from '../../../../../package.json'

const yo = require('yo-yo')
const addTooltip = require('../ui/tooltip')

const css = require('./styles/compile-tab-styles')

const css = require('./styles/compile-tab-styles')

const profile = {
  name: 'solidity',
  displayName: 'Solidity compiler',
  icon: 'assets/img/solidity.webp',
  description: 'Compile solidity contracts',
  kind: 'compiler',
  permission: true,
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/solidity_editor.html',
  version: packageJson.version,
  methods: ['getCompilationResult', 'compile', 'compileWithParameters', 'setCompilerConfig', 'compileFile', 'getCompilerState']
}

// EditorApi:
// - events: ['compilationFinished'],
// - methods: ['getCompilationResult']

class CompileTab extends CompilerApiMixin(ViewPlugin) { // implements ICompilerApi
  constructor (config, fileManager) {
    super(profile)
    this.fileManager = fileManager
    this.config = config
    this.queryParams = new QueryParams()
    this.compileTabLogic = new CompileTabLogic(this, this.contentImport)
    this.compiler = this.compileTabLogic.compiler
    this.compileTabLogic.init()
    this.initCompilerApi()
  }

  renderComponent () {
    ReactDOM.render(
      <SolidityCompiler api={this}/>
      , this.el)
  }

  onCurrentFileChanged () {
    this.renderComponent()
  }

  onResetResults () {
    this.renderComponent()
  }

  /************
   * EVENTS
   */

  listenToEvents () {
    this.data.eventHandlers.onContentChanged = () => {
      this.emit('statusChanged', { key: 'edited', title: 'the content has changed, needs recompilation', type: 'info' })
    }
    this.editor.event.register('contentChanged', this.data.eventHandlers.onContentChanged)

    this.data.eventHandlers.onLoadingCompiler = () => {
      this.data.loading = true
      this.emit('statusChanged', { key: 'loading', title: 'loading compiler...', type: 'info' })
    }
    this.compiler.event.register('loadingCompiler', this.data.eventHandlers.onLoadingCompiler)

    this.data.eventHandlers.onCompilerLoaded = () => {
      this.data.loading = false
      this.emit('statusChanged', { key: 'none' })
    }
    this.compiler.event.register('compilerLoaded', this.data.eventHandlers.onCompilerLoaded)

    this.data.eventHandlers.onStartingCompilation = () => {
      this.emit('statusChanged', { key: 'loading', title: 'compiling...', type: 'info' })
    }

    this.data.eventHandlers.onRemoveAnnotations = () => {
      this.call('editor', 'clearAnnotations')
    }

    const resetView = (isLocalhost) => {
      this.compileTabLogic.isHardhatProject().then((result) => {
        if (result && isLocalhost) this.isHardHatProject = true
        else this.isHardHatProject = false
        this.renderComponent()
      })
      this.resetResults()
    }

    this.on('filePanel', 'setWorkspace', (workspace) => {
      resetView(workspace.isLocalhost)
    })

    this.on('remixd', 'rootFolderChanged', () => {
      resetView(true)
    })

    this.compileTabLogic.event.on('startingCompilation', this.data.eventHandlers.onStartingCompilation)
    this.compileTabLogic.event.on('removeAnnotations', this.data.eventHandlers.onRemoveAnnotations)

    this.data.eventHandlers.onCurrentFileChanged = (name) => {
      this.currentFile = name
      this.renderComponent()
    }
    this.fileManager.events.on('currentFileChanged', this.data.eventHandlers.onCurrentFileChanged)

    this.data.eventHandlers.onNoFileSelected = () => {
      this.currentFile = ''
      this.renderComponent()
    }
    this.fileManager.events.on('noFileSelected', this.data.eventHandlers.onNoFileSelected)

    this.data.eventHandlers.onCompilationFinished = (success, data, source) => {
      this.setCompileErrors(data)
      if (success) {
        // forwarding the event to the appManager infra
        this.emit('compilationFinished', source.target, source, 'soljson', data)
        if (data.errors && data.errors.length > 0) {
          this.emit('statusChanged', {
            key: data.errors.length,
            title: `compilation finished successful with warning${data.errors.length > 1 ? 's' : ''}`,
            type: 'warning'
          })
        } else this.emit('statusChanged', { key: 'succeed', title: 'compilation successful', type: 'success' })
        // Store the contracts
        this.contractsDetails = {}
        this.compiler.visitContracts((contract) => {
          this.contractsDetails[contract.name] = parseContracts(
            contract.name,
            contract.object,
            this.compiler.getSource(contract.file)
          )
        })
      } else {
        const count = (data.errors ? data.errors.filter(error => error.severity === 'error').length : 0) + data.error ? 1 : 0
        this.emit('statusChanged', { key: count, title: `compilation failed with ${count} error${count.length > 1 ? 's' : ''}`, type: 'error' })
      }
      // Update contract Selection
      this.contractMap = {}
      if (success) this.compiler.visitContracts((contract) => { this.contractMap[contract.name] = contract })
      this.renderComponent()
    }
    this.compiler.event.register('compilationFinished', this.data.eventHandlers.onCompilationFinished)

    this.data.eventHandlers.onThemeChanged = (theme) => {
      const invert = theme.quality === 'dark' ? 1 : 0
      const img = document.getElementById('swarmLogo')
      if (img) {
        img.style.filter = `invert(${invert})`
      }
    }
    globalRegistry.get('themeModule').api.events.on('themeChanged', this.data.eventHandlers.onThemeChanged)

    // Run the compiler instead of trying to save the website
    $(window).keydown((e) => {
      // ctrl+s or command+s
      if ((e.metaKey || e.ctrlKey) && e.keyCode === 83) {
        e.preventDefault()
        this.compileTabLogic.runCompiler(this.hhCompilation)
      }
    })
  }

  onNoFileSelected () {
    this.renderComponent()
  }

  onCompilationFinished () {
    this.renderComponent()
  }

  render () {
    if (this.el) return this.el
    this.el = yo`
      <div class="${css.debuggerTabView}" id="compileTabView">
        <div id="compiler" class="${css.compiler}"></div>
      </div>`
    this.renderComponent()

    return this.el
  }

  async compileWithParameters (compilationTargets, settings) {
    return await super.compileWithParameters(compilationTargets, settings)
  }

  getCompilationResult () {
    return super.getCompilationResult()
  }

  getFileManagerMode () {
    return this.fileManager.mode
  }

  /**
   * set the compiler configuration
   * This function is used by remix-plugin compiler API.
   * @param {object} settings {evmVersion, optimize, runs, version, language}
   */
  setCompilerConfig (settings) {
    super.setCompilerConfig(settings)
    this.renderComponent()
    // @todo(#2875) should use loading compiler return value to check whether the compiler is loaded instead of "setInterval"
    addTooltip(yo`<div><b>${this.currentRequest.from}</b> is updating the <b>Solidity compiler configuration</b>.<pre class="text-left">${JSON.stringify(settings, null, '\t')}</pre></div>`)
  }

  compile (fileName) {
    addTooltip(yo`<div><b>${this.currentRequest.from}</b> is requiring to compile <b>${fileName}</b></div>`)
    super.compile(fileName)
  }

  compileFile (event) {
    return super.compileFile(event)
  }

  async onActivation () {
    super.onActivation()
    this.call('filePanel', 'registerContextMenuItem', {
      id: 'solidity',
      name: 'compileFile',
      label: 'Compile',
      type: [],
      extension: ['.sol'],
      path: [],
      pattern: []
    })
    this.currentFile = await this.call('fileManager', 'file')
  }

  getCompilerParameters () {
    const params = this.queryParams.get()
    params.optimize = (params.optimize === 'false' || params.optimize === null || params.optimize === undefined) ? false : params.optimize
    params.optimize = params.optimize === 'true' ? true : params.optimize
    return params
  }

  setCompilerParameters (params) {
    this.queryParams.update(params)
  }

  getAppParameter (name) {
    // first look in the URL params then in the local storage
    const params = this.queryParams.get()
    const param = params[name] ? params[name] : this.config.get(name)
    if (param === 'true') return true
    if (param === 'false') return false
    return param
  }

  setAppParameter (name, value) {
    this.config.set(name, value)
  }
}

module.exports = CompileTab
