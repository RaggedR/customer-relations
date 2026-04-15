****************
ARCHITECT
****************

 - Abstraction, encapsulation, information hiding.
 - Clean separation of concerns.
 - Minimize dependencies between modules. 
 - Clear distinction between interface and implementation of sub-systems
 

 - Each method should do one thing and do it completely.
 - If you find the same pattern of code repeated over and over, this is a red flag that you haven't found the right abstraction. See if you can reorganize the code to eliminate the repetition. 
 
 - Use deep modules (large implementation, small interface)
 - Some complexity comes just from the number of components: the more components, the harder to keep track of them all

 - Subdivision can result in duplication: code that was present in a
single instance before subdivision may need to be present in each
of the subdivided components. 
- Splitting up a method only makes sense if it results in cleaner abstractions
- Methods containing hundreds of lines of code are fine if they have
a simple signature and are easy to read. When designing methods, the most important goal is to provide clean and simple abstractions.
 - Bring together all of the code related to a particular capability and have a single method that performs the entire computation.
 - When two or more modules are combined into a single module, it may be
possible to define an interface for the new module that is simpler or easier
to use than the original interfaces. 
  - Simplifying the interface sometimes makes the implementation more complicated. But it is worth it. 



 - Information hiding: If a piece of information is hidden, there are no dependencies on that information outside the module containing that information. This is good. Think carefully about what information can be hidden 
 - Classes which share information should be merged into one. information hiding can often be improved by making a class slightly larger.
 - Pick the structure that results in the best information hiding, the fewest
dependencies, and the deepest interfaces.
 
 - It is okay to redo the architecture as necessary when adding new features.
 - Think about whether the current system design is still the best
one, in light of the desired change. If not, refactor the system so that you
end up with the best possible design. With this approach, the system design
improves with every modification. 
 - The best way to end up with a good design is to develop a system in
increments, where each increment adds a few new abstractions and
refactors existing abstractions based on experience.
 - Developing incrementally is generally a good idea, but the increments
of development should be abstractions, not features.
 - Whenever you modify any code, try to find a way
to improve the system design at least a little bit in the process.


 - Document "design decisions" as you go. Architectural design.
 - Write "interface documentation" for each module. 
 - Document any known dependencies between modules

 - Try to imagine a few ways in which the system might need to be changed in the future and make sure that will be easy with your design.
 - Don’t get carried away and build something so general-purpose that it is difficult to use for your current needs.
 - In a well-designed system, each layer provides a different abstraction from the layers above and below it; if you follow a single operation as it moves up and down through layers by invoking methods, the abstractions change with each method call.

 - follow guidelines for coding style
 - use meaningful variable names. Good variable names eliminate obscurity. Consistant naming reduces "cognitive load"

 - Exception handling is one of the worst sources of complexity in software
systems. Some suggestions: Handle exceptions as close as possible to where they occur. Reduce what higher layers need to think about. Provide a sensible fallback. Aggregate exceptions: Handle them in one place. Sometimes its best just to crash.





******************
CODE REVIEW
******************

 - Identify patterns of repeated code.
 - Identify methods which try to do too many things.
 - Identify complexity. A simple change requires modification in many different locations
 - Identify excess "cognitive load." How much surrounding code do you need to read to understand a given section.
 
 - Code should be "obvious." If code is "obvious", it means that someone can read the code quickly, without much thought, and their first guesses about the behavior or meaning
of the code will be correct. If code is "nonobvious", that usually means there is important information about the code that the reader does not have. Related code blocks should be located close together.
 - It should be possible to understand each method independently. If you can’t understand the implementation of one method without also
understanding the implementation of another, that’s a red flag
 - Request implementation documentatino where not obvious.

 - Red flag: shallow modules, interface complicated compared to functionality.
 - Red Flag: Methods which try to do too many things. Should be split into more than one method.
 - Red Flag: Too man sub-components (or not enough: God class)
 - Red Flag: No sensible interface defaults.
 - Red Flag: No interface documentation.

 - Red Flag: "information leaks." Same information encoded in multiple places. Might require merging two modules. Classes which share information should be merged into one.

 - Report: any lack of separation of concerns
 - Report: any undocumented dependencies between modules.
 - Report: any lack of distinction between interface and implementation.
 - Report: overly complex interfaces (check the complexity of associated documentation)
 - Report: dead code
 - Report: Un-needed testing code and comments
 - Report: messy exception handling
 - Request implementation documentation where it seems helpful
 - Enforce coding style and variable names


************
TEST AGENT
************
 - unit test
 - integration test
 - E2E test (playwrite)
 - Property-based testing
 - regression test
 - fuzz test
 - import / export data
 - human click tests (see HUMAN_TEST_TODO.md)
 - SQL injection attack
 - malformed input to forms (generate data)
 - uploading malformed JSON, CSV (generate data)
 - boundary cases
 - incorrect types
 - Duplicate users
 - Double booking
 - Race conditions
 - API abuse
 - Authentication / authorization bypass
 - Rate limiting

 *****************
 SECURITY
 *****************
 
 Input safety
 Strict validation everywhere
 Data protection
 Encryption at rest
 Encryption in transit
 Access control
 Authentication
 Role-based authorization
 Audit logging
 Who accessed what
 When
 API protection
 Rate limiting
 Input sanitization
 
 
 
 

********************
DOCUMENTATION AGENT
********************
 - Progressive disclosure
 - Architecture overview
 - Design decisions 
 - system design, data flow
 - Module interfaces
 - side-effects
 - constraints
 - Sub-module interfaces


**************
ASK CLAUDE
**************

I want my code to be:
 - robust
 - maintainable
 - secure
 - compliant with patient privacy requirements
 - production ready
 - performance (latency)
 - Observability (logs, metrics, tracing)
 - Reliability (failure handling, uptime)
 - Data integrity (no corruption, consistency)
 - Auditability (who did what, when)
 - Scalability (can handle growth)
 - Recoverability (backups, rollback)
 - what else?

Architect -> Code Review -> Architect -> Code review (until code review says it good)
Test (write tests and run tests, fix bugs, writes regression tests)
Documentation agent
Human click tests
Production Checks
   → security
   → performance
   → observability


1) Observability 

Structured logging
Metrics (latency, errors)
Tracing

2) Reliability
Graceful failure
Retry strategies
No silent failures

3) Data Integrity
Transactions
Constraints
Validation

4) Performance

Latency
Throughput
Memory usage

5) Concurrency

Race conditions
Double writes
Conflicts

6. Deployment Safety
Migrations (safe DB changes)
Rollbacks
Versioning
