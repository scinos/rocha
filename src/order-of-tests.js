const log = require('debug')('rocha')
const la = require('lazy-ass')
const is = require('check-more-types')
const _ = require('lodash')
const {Just, Nothing} = require('ramda-fantasy').Maybe
const R = require('ramda')
const {has, pathSatisfies, lt, tap, allPass} = R

const positive = lt(0)
const isObject = R.is(Object)

const isValidSuite = allPass([
  isObject,
  has('suites'),
  pathSatisfies(positive, ['suites', 'length'])
])

function maybeSuites (suite) {
  return isValidSuite(suite) ? Just(suite) : Nothing()
}

const logShuffle = (s) =>
  log('shuffling %d describe blocks in "%s"',
    s.suites.length, s.title)

const suitesLens = R.lensProp('suites')
const shuffleSuites = R.over(suitesLens, _.shuffle)
const shuffleNestedSuites = R.over(suitesLens, R.map(shuffleDescribes))

function shuffleTests (suite) {
  if (Array.isArray(suite) && suite.tests.length) {
    log('shuffling %d unit tests in "%s"',
      suite.tests.length, suite.title)
    suite.tests = _.shuffle(suite.tests)
  }
  if (Array.isArray(suite.suites)) {
    suite.suites.forEach(shuffleTests)
  }
  return suite
}

function shuffleDescribes (suite) {
  return maybeSuites(suite)
    .map(tap(logShuffle))
    .map(shuffleSuites)
    .map(shuffleTests)
    .map(shuffleNestedSuites)
    .getOrElse(suite)
}

function collectSuite (suite, collected) {
  collected.push({
    title: suite.fullTitle(),
    tests: suite.tests.map(t => t.title)
  })
  suite.suites.forEach(s => collectSuite(s, collected))
}

function collectTestOrder (rootSuite) {
  const suites = []
  collectSuite(rootSuite, suites)
  return suites
}

// reorders given tests according to the given list of titles
// any titles not found will be ignored
// tests without a title will be added at the end
function setTestOrder (suite, tests, titles) {
  la(is.array(tests), 'invalid tests', tests)
  la(is.array(titles), 'invalid titles', titles)

  const orderedTests = []
  titles.forEach(title => {
    const test = _.find(tests, { title: title })
    if (!test) {
      log('cannot find test under title', title, 'skipping')
      return
    }
    la(test, 'could not find test with title', title,
      'among', tests, 'in', suite.fullTitle())
    orderedTests.push(test)
  })
  const newTests = _.difference(tests, orderedTests)
  suite.tests = orderedTests.concat(newTests)
}

// recursively goes through the tree of suites
function setOrder (suite, order) {
  const foundInfo = _.find(order, { title: suite.fullTitle() })
  if (foundInfo) {
    log('restoring order to', foundInfo.title)
    // need to compare number of tests, etc
    setTestOrder(suite, suite.tests, foundInfo.tests)
  }
  suite.suites.forEach(s => setOrder(s, order))
}

module.exports = {
  shuffle: shuffleDescribes,
  set: setOrder,
  collect: collectTestOrder
}
