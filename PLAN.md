What I'm trying to build is a circuit simulator. But this is not an average circuit sim. What I'm trying to build has a main feature, code to circuit. This circuits
 are not gate level like verilog. They are IC and real component mapping system. Like when I write (A1 pin 3 ->  01 pin 1, X1 pin 2). When compiled the connections will be drawn the
 as mentioned while importing the proper components. 
 At the beginning, we will define these components first like this 
   @comp A1 7408 // A1 is a variable name shown as user label and 7408 is the generic name of the IC
   @board B1 breadboard_830 // we can define boards like breadboards, pcb or veroboard (breadboards will automatically place left side to f rail and e rail)
We can also define a custom IC: 
  def IC_NAME (
  	pin1-> input, 
  	pin2->output, 
  	pin3->gnd. 
 ) 	
We will enforce type checking whereas input,
 output, gnd are data types. The map () will be our main function, where how we are mapping will be mentioned in above mentioned style (A1 pin 3 ->  01 pin 1, X1 pin 2)
	map (
	(A1 pin 3 ->  01 pin 1, X1 pin 2)
	(A1 pin 6 ->  01 pin 2, X1 pin 2)
	(A1 pin 8 ->  01 pin 4, X1 pin 2)
	(A1 pin 11 ->  01 pin 5, X1 pin 2)
	(01 pin 3 ->  X1 pin 2)
	) // Like this

The breadboard pin numbers are allocated based on where the leg of the IC is and immediate next pin that is free. If needed more points on board simply jump wire to a place where the entire row empty (so that there are no conflicts). 
This is a complicated project. So do not try to build everything at once. At first we will make the language and interpreter first. We will make the interpreter language like python, compiled in C++. So, first lay a system design addressing the shortcomings. Then upon approving the plan, you can start.  You can use openGL or WebGL for predefined componets, your wish. You will run out of context window eventually, so mark a checkpoint everytime on how much you have finished. instead of providing too many summary docs. We will follow incremental development. Codebase should be modular, and clean. Use ultra think. Pay attention.  
 Do not make the interface like a child's interface with emojis, too many colors, dark mode etc. Keep things professional looking. Avoid using emojis at code level and in interface at all cost. 
